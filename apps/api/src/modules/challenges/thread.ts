import {
  type Comment,
  commentResponseSchema,
  createCommentSchema,
  MAX_COMMENT_DEPTH,
  THREAD_PAGE_DEPTH,
  threadQuerySchema,
  threadResponseSchema,
} from "@perspective/shared";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { comments } from "../../db/schema";
import { AppError } from "../../errors";
import { requireUser, requireVerifiedEmail } from "../../plugins/auth";
import { flagIfSuspicious, rejectDuplicate } from "../moderation/spam";
import { notify } from "../notifications/notify";
import { findChallenge } from "./routes";

const DAILY_LIMIT = 100;
const MAX_ROWS = 1000;
const idParams = z.object({ id: z.uuid() });

interface ThreadRow extends Record<string, unknown> {
  id: string;
  parent_id: string | null;
  body: string;
  depth: number;
  created_at: Date;
  deleted_at: Date | null;
  removed_at: Date | null;
  username: string | null;
  has_more: boolean;
}

function toComment(row: ThreadRow): Comment {
  const deleted = row.deleted_at !== null;
  const removed = row.removed_at !== null;
  const hidden = deleted || removed;
  return {
    id: row.id,
    parentId: row.parent_id,
    body: hidden ? "" : row.body,
    author: hidden || !row.username ? null : { username: row.username },
    depth: row.depth,
    createdAt: new Date(row.created_at).toISOString(),
    deleted,
    removed,
    hasMoreReplies: row.has_more,
  };
}

// Loads up to THREAD_PAGE_DEPTH levels in one recursive query (D11), starting
// from the top-level comments or from one comment ("continue this thread").
// The path of ids sorts the result depth-first, oldest reply first, so the
// browser can render it top to bottom.
async function loadThread(challengeId: string, rootId?: string) {
  const start = rootId ? sql`c.id = ${rootId}` : sql`c.parent_id is null`;

  const result = await db.execute<ThreadRow>(sql`
    with recursive thread as (
      select c.*, 1 as level, array[c.id] as path
      from comments c
      where c.challenge_id = ${challengeId} and ${start}
      union all
      select c.*, t.level + 1, t.path || c.id
      from comments c
      join thread t on c.parent_id = t.id
      where t.level < ${THREAD_PAGE_DEPTH}
    )
    select t.id, t.parent_id, t.body, t.depth, t.created_at, t.deleted_at,
           t.removed_at, u.username,
           (t.level = ${THREAD_PAGE_DEPTH} and exists (
             select 1 from comments r where r.parent_id = t.id
           )) as has_more
    from thread t
    left join users u on u.id = t.author_id
    order by t.path
    limit ${MAX_ROWS}
  `);
  return result.rows.map(toComment);
}

export const threadRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/challenges/:id/comments",
    {
      schema: {
        params: idParams,
        querystring: threadQuerySchema,
        response: { 200: threadResponseSchema },
      },
    },
    async (request) => {
      await findChallenge(request.params.id);
      const thread = await loadThread(request.params.id, request.query.root);
      if (request.query.root && thread.length === 0) {
        throw new AppError(404, "NOT_FOUND", "Comment not found");
      }
      return { comments: thread };
    },
  );

  app.post(
    "/challenges/:id/comments",
    {
      preHandler: requireVerifiedEmail,
      config: { rateLimit: { max: 60, timeWindow: 60 * 60_000 } },
      schema: {
        params: idParams,
        body: createCommentSchema,
        response: { 201: commentResponseSchema },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const challenge = await findChallenge(request.params.id);
      const { body, parentId } = request.body;

      const [recent] = await db
        .select({ total: count() })
        .from(comments)
        .where(
          and(
            eq(comments.authorId, user.id),
            gt(comments.createdAt, sql`now() - interval '1 day'`),
          ),
        );
      if ((recent?.total ?? 0) >= DAILY_LIMIT) {
        throw new AppError(
          429,
          "RATE_LIMITED",
          `You can write up to ${String(DAILY_LIMIT)} replies a day`,
        );
      }

      // Replying to a comment: it must be in this challenge and not deleted.
      let parent: { depth: number; authorId: string | null } | undefined;
      if (parentId) {
        [parent] = await db
          .select({ depth: comments.depth, authorId: comments.authorId })
          .from(comments)
          .where(
            and(
              eq(comments.id, parentId),
              eq(comments.challengeId, challenge.id),
              isNull(comments.deletedAt),
              isNull(comments.removedAt),
            ),
          );
        if (!parent) {
          throw new AppError(404, "NOT_FOUND", "That comment no longer exists");
        }
        if (parent.depth >= MAX_COMMENT_DEPTH) {
          throw new AppError(
            400,
            "BAD_REQUEST",
            "This thread is too deep to reply to",
          );
        }
      }

      const created = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(comments)
          .values({
            challengeId: challenge.id,
            parentId: parentId ?? null,
            authorId: user.id,
            body,
            depth: parent ? parent.depth + 1 : 1,
          })
          .returning();
        if (!row) throw new Error("Insert returned no comment");
        await rejectDuplicate(tx, "comment", {
          id: row.id,
          authorId: user.id,
          body,
        });
        await flagIfSuspicious(tx, {
          type: "comment",
          id: row.id,
          body,
          author: user,
        });

        // A reply notifies the parent's author; a top-level comment notifies
        // the person who started the challenge.
        await notify(tx, {
          userId: parent ? parent.authorId : challenge.createdBy,
          actorId: user.id,
          type: "comment_reply",
          challengeId: challenge.id,
          commentId: row.id,
        });
        return row;
      });

      return reply.status(201).send({
        comment: {
          id: created.id,
          parentId: created.parentId,
          body: created.body,
          author: { username: user.username },
          depth: created.depth,
          createdAt: created.createdAt.toISOString(),
          deleted: false,
          removed: false,
          hasMoreReplies: false,
        },
      });
    },
  );

  // Soft delete (D15): replies underneath keep their place in the thread.
  app.delete(
    "/comments/:id",
    { schema: { params: idParams } },
    async (request, reply) => {
      const user = requireUser(request);
      const [comment] = await db
        .select({ authorId: comments.authorId })
        .from(comments)
        .where(
          and(eq(comments.id, request.params.id), isNull(comments.deletedAt)),
        );
      if (!comment) throw new AppError(404, "NOT_FOUND", "Comment not found");
      if (comment.authorId !== user.id) {
        throw new AppError(
          403,
          "FORBIDDEN",
          "You can only delete your own comments",
        );
      }
      await db
        .update(comments)
        .set({ deletedAt: new Date() })
        .where(eq(comments.id, request.params.id));
      return reply.status(204).send();
    },
  );
};
