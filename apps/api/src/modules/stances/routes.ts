import { myStanceResponseSchema, setStanceSchema } from "@perspective/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { stanceHistory, userStances } from "../../db/schema";
import { AppError } from "../../errors";
import { requireUser } from "../../plugins/auth";
import { findPublishedQuestionId } from "../questions/find";

const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const slugParams = z.object({ slug: z.string().min(1).max(200) });

function changeableAt(updatedAt: Date): string | null {
  const next = new Date(updatedAt.getTime() + COOLDOWN_MS);
  return next.getTime() > Date.now() ? next.toISOString() : null;
}

export async function findStance(userId: string, questionId: string) {
  const [row] = await db
    .select()
    .from(userStances)
    .where(
      and(
        eq(userStances.userId, userId),
        eq(userStances.questionId, questionId),
      ),
    );
  return row ?? null;
}

export const stanceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/questions/:slug/stance",
    {
      schema: {
        params: slugParams,
        response: { 200: myStanceResponseSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      const questionId = await findPublishedQuestionId(request.params.slug);
      const row = await findStance(user.id, questionId);
      return {
        stance: row?.stance ?? null,
        changeableAt: row ? changeableAt(row.updatedAt) : null,
      };
    },
  );

  // Declaring is free; changing is limited to once per 24 hours per question,
  // so nobody can flip sides right before each vote to farm cross-side credit.
  app.put(
    "/questions/:slug/stance",
    {
      config: { rateLimit: { max: 30, timeWindow: 60 * 60_000 } },
      schema: {
        params: slugParams,
        body: setStanceSchema,
        response: { 200: myStanceResponseSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      const questionId = await findPublishedQuestionId(request.params.slug);
      const { stance } = request.body;
      const key = and(
        eq(userStances.userId, user.id),
        eq(userStances.questionId, questionId),
      );

      const row = await db.transaction(async (tx) => {
        // The row lock makes simultaneous changes wait for each other, so two
        // requests can't both slip past the cooldown check.
        const [current] = await tx
          .select()
          .from(userStances)
          .where(key)
          .for("update");

        if (!current) {
          const [created] = await tx
            .insert(userStances)
            .values({ userId: user.id, questionId, stance })
            .onConflictDoNothing()
            .returning();
          if (!created) {
            throw new AppError(409, "BAD_REQUEST", "Please try again");
          }
          await tx
            .insert(stanceHistory)
            .values({ userId: user.id, questionId, toStance: stance });
          return created;
        }

        if (current.stance === stance) return current;

        const waitUntil = changeableAt(current.updatedAt);
        if (waitUntil) {
          throw new AppError(
            429,
            "STANCE_COOLDOWN",
            "You can change your stance once a day",
          );
        }

        const [updated] = await tx
          .update(userStances)
          .set({ stance, updatedAt: new Date() })
          .where(key)
          .returning();
        await tx.insert(stanceHistory).values({
          userId: user.id,
          questionId,
          fromStance: current.stance,
          toStance: stance,
        });
        return updated ?? current;
      });

      return { stance: row.stance, changeableAt: changeableAt(row.updatedAt) };
    },
  );
};
