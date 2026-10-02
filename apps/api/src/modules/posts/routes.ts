import {
  createPostSchema,
  postListQuerySchema,
  postListResponseSchema,
  postResponseSchema,
  updatePostSchema,
} from "@perspective/shared";
import { and, count, eq, gt, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { uniqueViolation } from "../../db/errors";
import { posts } from "../../db/schema";
import { AppError } from "../../errors";
import { requireUser, requireVerifiedEmail } from "../../plugins/auth";
import { findPublishedQuestionId } from "../questions/find";
import { findStance } from "../stances/routes";
import { findPost, live, selectPosts, toPost } from "./queries";
import { rankPosts } from "./ranking";

const DAILY_LIMIT = 10;

// Authorization, not just authentication: being logged in isn't enough to
// change a post, it has to be yours.
async function findOwnPost(postId: string, userId: string) {
  const row = await findPost(postId, userId);
  if (row.authorId !== userId) {
    throw new AppError(403, "FORBIDDEN", "You can only change your own posts");
  }
  return row;
}

const slugParams = z.object({ slug: z.string().min(1).max(200) });
const idParams = z.object({ id: z.uuid() });

export const postRoutes: FastifyPluginAsyncZod = async (app) => {
  // One column of a question, sorted by Top, Hot or New.
  app.get(
    "/questions/:slug/posts",
    {
      schema: {
        params: slugParams,
        querystring: postListQuerySchema,
        response: { 200: postListResponseSchema },
      },
    },
    async (request) => {
      const questionId = await findPublishedQuestionId(request.params.slug);
      const { stance, sort, cursor, limit } = request.query;
      const ranking = rankPosts(sort, cursor);

      const rows = await selectPosts(request.user?.id ?? null, ranking.rank)
        .where(
          and(
            live,
            eq(posts.questionId, questionId),
            eq(posts.stance, stance),
            ranking.after,
          ),
        )
        .orderBy(...ranking.orderBy)
        .limit(limit + 1);

      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        posts: page.map(toPost),
        nextCursor:
          rows.length > limit && last ? ranking.nextCursor(last) : null,
      };
    },
  );

  // A post goes into the column of its author's current stance (D4).
  app.post(
    "/questions/:slug/posts",
    {
      preHandler: requireVerifiedEmail,
      schema: {
        params: slugParams,
        body: createPostSchema,
        response: { 201: postResponseSchema },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const questionId = await findPublishedQuestionId(request.params.slug);

      const stance = await findStance(user.id, questionId);
      if (!stance) {
        throw new AppError(
          409,
          "STANCE_REQUIRED",
          "Choose where you stand before posting",
        );
      }

      const [recent] = await db
        .select({ total: count() })
        .from(posts)
        .where(
          and(
            eq(posts.authorId, user.id),
            gt(posts.createdAt, sql`now() - interval '1 day'`),
          ),
        );
      if ((recent?.total ?? 0) >= DAILY_LIMIT) {
        throw new AppError(
          429,
          "RATE_LIMITED",
          `You can write up to ${String(DAILY_LIMIT)} posts a day`,
        );
      }

      let postId: string;
      try {
        const [created] = await db
          .insert(posts)
          .values({
            ...request.body,
            questionId,
            authorId: user.id,
            stance: stance.stance,
          })
          .returning({ id: posts.id });
        if (!created) throw new Error("Insert returned no post");
        postId = created.id;
      } catch (err) {
        if (uniqueViolation(err) === "posts_author_question_stance_unique") {
          throw new AppError(
            409,
            "ALREADY_POSTED",
            "You already have a post on this side. Edit it instead.",
          );
        }
        throw err;
      }

      return reply
        .status(201)
        .send({ post: toPost(await findPost(postId, user.id)) });
    },
  );

  app.get(
    "/posts/:id",
    { schema: { params: idParams, response: { 200: postResponseSchema } } },
    async (request) => ({
      post: toPost(await findPost(request.params.id, request.user?.id ?? null)),
    }),
  );

  app.patch(
    "/posts/:id",
    {
      config: { rateLimit: { max: 30, timeWindow: 60 * 60_000 } },
      schema: {
        params: idParams,
        body: updatePostSchema,
        response: { 200: postResponseSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      await findOwnPost(request.params.id, user.id);
      await db
        .update(posts)
        .set({ ...request.body, editedAt: new Date() })
        .where(eq(posts.id, request.params.id));
      return { post: toPost(await findPost(request.params.id, user.id)) };
    },
  );

  // Soft delete (D15): the row stays so future challenges and replies that
  // point at it don't break, but it disappears from the columns.
  app.delete(
    "/posts/:id",
    { schema: { params: idParams } },
    async (request, reply) => {
      const user = requireUser(request);
      await findOwnPost(request.params.id, user.id);
      await db
        .update(posts)
        .set({ deletedAt: new Date() })
        .where(eq(posts.id, request.params.id));
      return reply.status(204).send();
    },
  );
};
