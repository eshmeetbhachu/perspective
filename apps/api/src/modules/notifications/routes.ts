import {
  notificationListResponseSchema,
  unreadCountResponseSchema,
} from "@perspective/shared";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { db } from "../../db/client";
import { challenges, notifications, users } from "../../db/schema";
import { requireUser } from "../../plugins/auth";

const PAGE_SIZE = 30;

async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.total ?? 0;
}

export const notificationRoutes: FastifyPluginAsyncZod = async (app) => {
  // Polled by the header badge, so it only counts (via a partial index).
  app.get(
    "/notifications/unread-count",
    {
      logLevel: "warn",
      schema: { response: { 200: unreadCountResponseSchema } },
    },
    async (request) => ({
      unreadCount: await unreadCount(requireUser(request).id),
    }),
  );

  app.get(
    "/notifications",
    { schema: { response: { 200: notificationListResponseSchema } } },
    async (request) => {
      const user = requireUser(request);
      const rows = await db
        .select({
          id: notifications.id,
          type: notifications.type,
          actorUsername: users.username,
          challengeId: notifications.challengeId,
          challengeTitle: challenges.title,
          commentId: notifications.commentId,
          readAt: notifications.readAt,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .innerJoin(challenges, eq(challenges.id, notifications.challengeId))
        .leftJoin(users, eq(users.id, notifications.actorId))
        .where(eq(notifications.userId, user.id))
        .orderBy(desc(notifications.id))
        .limit(PAGE_SIZE);

      return {
        notifications: rows.map((row) => ({
          id: row.id,
          type: row.type,
          actor: row.actorUsername ? { username: row.actorUsername } : null,
          challengeId: row.challengeId,
          challengeTitle: row.challengeTitle,
          commentId: row.commentId,
          read: row.readAt !== null,
          createdAt: row.createdAt.toISOString(),
        })),
        unreadCount: await unreadCount(user.id),
      };
    },
  );

  app.post("/notifications/read", async (request, reply) => {
    const user = requireUser(request);
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(notifications.userId, user.id), isNull(notifications.readAt)),
      );
    return reply.status(204).send();
  });
};
