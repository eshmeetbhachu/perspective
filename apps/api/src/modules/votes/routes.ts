import { VOTING_ACCOUNT_AGE_HOURS, voteSchema } from "@perspective/shared";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { posts, postVotes } from "../../db/schema";
import { AppError } from "../../errors";
import { requireUser, requireVerifiedEmail } from "../../plugins/auth";
import { findPost } from "../posts/queries";
import { findStance } from "../stances/routes";
import { isCrossSide, voteWeight } from "./weights";

const idParams = z.object({ id: z.uuid() });
const voteLimit = { rateLimit: { max: 120, timeWindow: 60 * 60_000 } };

const counts = {
  helpfulScore: posts.helpfulScore,
  helpfulCount: posts.helpfulCount,
  crossSideCount: posts.crossSideCount,
};

export const voteRoutes: FastifyPluginAsyncZod = async (app) => {
  app.put(
    "/posts/:id/vote",
    {
      config: voteLimit,
      preHandler: requireVerifiedEmail,
      schema: { params: idParams, response: { 200: voteSchema } },
    },
    async (request) => {
      const user = requireUser(request);

      const votingFrom =
        user.createdAt.getTime() + VOTING_ACCOUNT_AGE_HOURS * 60 * 60 * 1000;
      if (Date.now() < votingFrom) {
        throw new AppError(
          403,
          "ACCOUNT_TOO_NEW",
          `New accounts can vote after ${String(VOTING_ACCOUNT_AGE_HOURS)} hours`,
        );
      }

      const post = await findPost(request.params.id, user.id);
      if (post.authorId === user.id) {
        throw new AppError(403, "OWN_POST", "You can't vote on your own post");
      }

      // Credit depends on where the voter stands, so they must have a stance (D6).
      const stance = await findStance(user.id, post.questionId);
      if (!stance) {
        throw new AppError(
          409,
          "STANCE_REQUIRED",
          "Choose where you stand on this question first",
        );
      }

      const weight = voteWeight(stance.stance, post.stance);
      const crossSide = isCrossSide(stance.stance, post.stance) ? 1 : 0;

      // The vote and the score change commit together or not at all, and the
      // primary key makes a repeated vote a no-op instead of a double count.
      return db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(postVotes)
          .values({
            userId: user.id,
            postId: post.id,
            voterStance: stance.stance,
            weight,
          })
          .onConflictDoNothing()
          .returning({ weight: postVotes.weight });

        const [updated] = inserted
          ? await tx
              .update(posts)
              .set({
                helpfulScore: sql`${posts.helpfulScore} + ${weight}`,
                helpfulCount: sql`${posts.helpfulCount} + 1`,
                crossSideCount: sql`${posts.crossSideCount} + ${crossSide}`,
              })
              .where(eq(posts.id, post.id))
              .returning(counts)
          : await tx.select(counts).from(posts).where(eq(posts.id, post.id));

        if (!updated) throw new AppError(404, "NOT_FOUND", "Post not found");
        return { ...updated, votedByMe: true };
      });
    },
  );

  // Removes exactly what the vote added, using the stance and weight stored
  // with it, even if the voter has changed sides since (D7).
  app.delete(
    "/posts/:id/vote",
    {
      config: voteLimit,
      schema: { params: idParams, response: { 200: voteSchema } },
    },
    async (request) => {
      const user = requireUser(request);
      const post = await findPost(request.params.id, user.id);

      return db.transaction(async (tx) => {
        const [removed] = await tx
          .delete(postVotes)
          .where(
            and(eq(postVotes.userId, user.id), eq(postVotes.postId, post.id)),
          )
          .returning({
            weight: postVotes.weight,
            voterStance: postVotes.voterStance,
          });

        const [updated] = removed
          ? await tx
              .update(posts)
              .set({
                helpfulScore: sql`${posts.helpfulScore} - ${removed.weight}`,
                helpfulCount: sql`${posts.helpfulCount} - 1`,
                crossSideCount: sql`${posts.crossSideCount} - ${isCrossSide(removed.voterStance, post.stance) ? 1 : 0}`,
              })
              .where(eq(posts.id, post.id))
              .returning(counts)
          : await tx.select(counts).from(posts).where(eq(posts.id, post.id));

        if (!updated) throw new AppError(404, "NOT_FOUND", "Post not found");
        return { ...updated, votedByMe: false };
      });
    },
  );
};
