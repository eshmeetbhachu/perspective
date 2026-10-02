import {
  type Challenge,
  challengeListResponseSchema,
  challengeResponseSchema,
  createChallengeSchema,
} from "@perspective/shared";
import { and, count, desc, eq, gt, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { uniqueViolation } from "../../db/errors";
import {
  challenges,
  comments,
  posts,
  questions,
  userStances,
  users,
} from "../../db/schema";
import { AppError } from "../../errors";
import { requireUser, requireVerifiedEmail } from "../../plugins/auth";
import { notify } from "../notifications/notify";
import { findPost, toPost } from "../posts/queries";

const DAILY_LIMIT = 5;
const idParams = z.object({ id: z.uuid() });

function selectChallenges() {
  return db
    .select({
      id: challenges.id,
      postId: challenges.postId,
      createdBy: challenges.createdBy,
      title: challenges.title,
      body: challenges.body,
      createdAt: challenges.createdAt,
      authorUsername: users.username,
      authorStance: userStances.stance,
      questionId: posts.questionId,
      commentCount: sql<number>`(
        select count(*) from ${comments}
        where ${comments.challengeId} = ${challenges.id}
          and ${comments.deletedAt} is null
      )::int`,
    })
    .from(challenges)
    .innerJoin(posts, eq(posts.id, challenges.postId))
    .innerJoin(questions, eq(questions.id, posts.questionId))
    .leftJoin(users, eq(users.id, challenges.createdBy))
    .leftJoin(
      userStances,
      and(
        eq(userStances.userId, challenges.createdBy),
        eq(userStances.questionId, posts.questionId),
      ),
    );
}

// Visible while the challenge is open and its question is published, even if
// the challenged post was deleted (D15).
const visible = and(
  eq(challenges.status, "open"),
  eq(questions.status, "published"),
);

type ChallengeRow = Awaited<ReturnType<typeof selectChallenges>>[number];

function toChallenge(row: ChallengeRow): Challenge {
  return {
    id: row.id,
    postId: row.postId,
    title: row.title,
    body: row.body,
    author: row.authorUsername ? { username: row.authorUsername } : null,
    authorStance: row.authorStance,
    commentCount: row.commentCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function findChallenge(challengeId: string) {
  const [row] = await selectChallenges().where(
    and(visible, eq(challenges.id, challengeId)),
  );
  if (!row) throw new AppError(404, "NOT_FOUND", "Challenge not found");
  return row;
}

export const challengeRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/posts/:id/challenges",
    {
      preHandler: requireVerifiedEmail,
      schema: {
        params: idParams,
        body: createChallengeSchema,
        response: { 201: challengeResponseSchema },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const post = await findPost(request.params.id, user.id);
      if (post.authorId === user.id) {
        throw new AppError(
          403,
          "OWN_POST",
          "You can't challenge your own post",
        );
      }

      const [recent] = await db
        .select({ total: count() })
        .from(challenges)
        .where(
          and(
            eq(challenges.createdBy, user.id),
            gt(challenges.createdAt, sql`now() - interval '1 day'`),
          ),
        );
      if ((recent?.total ?? 0) >= DAILY_LIMIT) {
        throw new AppError(
          429,
          "RATE_LIMITED",
          `You can start up to ${String(DAILY_LIMIT)} challenges a day`,
        );
      }

      let challengeId: string;
      try {
        challengeId = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(challenges)
            .values({ ...request.body, postId: post.id, createdBy: user.id })
            .returning({ id: challenges.id });
          if (!created) throw new Error("Insert returned no challenge");
          await notify(tx, {
            userId: post.authorId,
            actorId: user.id,
            type: "post_challenged",
            challengeId: created.id,
          });
          return created.id;
        });
      } catch (err) {
        if (uniqueViolation(err) === "challenges_creator_post_unique") {
          throw new AppError(
            409,
            "ALREADY_CHALLENGED",
            "You already challenged this post. Continue in its thread.",
          );
        }
        throw err;
      }

      return reply.status(201).send(await challengePage(challengeId, user.id));
    },
  );

  app.get(
    "/posts/:id/challenges",
    {
      schema: {
        params: idParams,
        response: { 200: challengeListResponseSchema },
      },
    },
    async (request) => {
      const rows = await selectChallenges()
        .where(and(visible, eq(challenges.postId, request.params.id)))
        .orderBy(desc(challenges.id))
        .limit(50);
      return { challenges: rows.map(toChallenge) };
    },
  );

  app.get(
    "/challenges/:id",
    {
      schema: { params: idParams, response: { 200: challengeResponseSchema } },
    },
    async (request) =>
      challengePage(request.params.id, request.user?.id ?? null),
  );
};

async function challengePage(challengeId: string, viewerId: string | null) {
  const row = await findChallenge(challengeId);
  const [question] = await db
    .select({ slug: questions.slug, title: questions.title })
    .from(questions)
    .where(eq(questions.id, row.questionId));
  if (!question) throw new AppError(404, "NOT_FOUND", "Challenge not found");

  // A deleted post shows as a placeholder; any other error is a real failure.
  let post = null;
  try {
    post = toPost(await findPost(row.postId, viewerId));
  } catch (err) {
    if (!(err instanceof AppError && err.statusCode === 404)) throw err;
  }
  return { challenge: toChallenge(row), post, question };
}
