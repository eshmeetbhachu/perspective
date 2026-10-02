import {
  auditResponseSchema,
  createReportSchema,
  moderationReasonSchema,
  type QueueItem,
  queueResponseSchema,
  REPORT_TARGETS,
  type ReportTarget,
  type UserRole,
} from "@perspective/shared";
import { and, count, desc, eq, gt, sql } from "drizzle-orm";
import type {
  FastifyPluginAsyncZod,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";
import { db, type Executor } from "../../db/client";
import { auditLog, reports, sessions, users } from "../../db/schema";
import { AppError } from "../../errors";
import { requireRole, requireUser } from "../../plugins/auth";
import { findTarget, setRemoved } from "./targets";

const REPORTS_PER_DAY = 20;
const ROLE_RANK: Record<UserRole, number> = { user: 0, moderator: 1, admin: 2 };

const targetParams = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.uuid(),
});
const userParams = z.object({ username: z.string().min(1).max(20) });

async function audit(
  tx: Executor,
  entry: typeof auditLog.$inferInsert,
): Promise<void> {
  await tx.insert(auditLog).values(entry);
}

async function closeReports(
  tx: Executor,
  target: { targetType: ReportTarget; targetId: string },
  status: "resolved" | "dismissed",
  moderatorId: string,
): Promise<void> {
  await tx
    .update(reports)
    .set({ status, resolvedBy: moderatorId, resolvedAt: new Date() })
    .where(
      and(
        eq(reports.targetType, target.targetType),
        eq(reports.targetId, target.targetId),
        eq(reports.status, "open"),
      ),
    );
}

export const moderationRoutes: FastifyPluginAsyncZod = async (app) => {
  // Anyone logged in can report. The answer is the same whether or not they
  // reported it before, and nothing about other reports is revealed.
  app.post(
    "/reports",
    { schema: { body: createReportSchema } },
    async (request, reply) => {
      const user = requireUser(request);
      const { targetType, targetId, reason, details } = request.body;

      const target = await findTarget(targetType, targetId);
      if (!target?.visible) {
        throw new AppError(404, "NOT_FOUND", "That content no longer exists");
      }
      if (target.authorId === user.id) {
        throw new AppError(
          403,
          "FORBIDDEN",
          "You can't report your own content",
        );
      }

      const [recent] = await db
        .select({ total: count() })
        .from(reports)
        .where(
          and(
            eq(reports.reporterId, user.id),
            gt(reports.createdAt, sql`now() - interval '1 day'`),
          ),
        );
      if ((recent?.total ?? 0) >= REPORTS_PER_DAY) {
        throw new AppError(
          429,
          "RATE_LIMITED",
          `You can send up to ${String(REPORTS_PER_DAY)} reports a day`,
        );
      }

      await db
        .insert(reports)
        .values({ reporterId: user.id, targetType, targetId, reason, details })
        .onConflictDoNothing();
      return reply.status(204).send();
    },
  );

  // Everything below is for moderators and admins only.
  await app.register(async (scope) => {
    const mod = scope.withTypeProvider<ZodTypeProvider>();
    mod.addHook("preHandler", requireRole("moderator"));

    // Most-reported first. Each item carries a preview so moderators can
    // judge it without opening another page.
    mod.get(
      "/moderation/queue",
      { schema: { response: { 200: queueResponseSchema } } },
      async () => {
        const groups = await db
          .select({
            targetType: reports.targetType,
            targetId: reports.targetId,
            reportCount: sql<number>`count(*)::int`,
            reasons: sql<
              QueueItem["reasons"]
            >`array_agg(distinct ${reports.reason})::text[]`,
            details: sql<
              string[]
            >`array_remove(array_agg(${reports.details}), '')`,
            lastReportedAt: sql<Date>`max(${reports.createdAt})`.mapWith(
              (value: string | Date) => new Date(value),
            ),
          })
          .from(reports)
          .where(eq(reports.status, "open"))
          .groupBy(reports.targetType, reports.targetId)
          .orderBy(desc(sql`count(*)`), desc(sql`max(${reports.createdAt})`))
          .limit(50);

        const items = await Promise.all(
          groups.map(async (group) => {
            const target = await findTarget(group.targetType, group.targetId);
            return {
              ...group,
              lastReportedAt: group.lastReportedAt.toISOString(),
              preview: target && {
                title: target.title,
                excerpt: target.excerpt,
                author: target.authorUsername
                  ? { username: target.authorUsername }
                  : null,
                authorBanned: target.authorBanned,
                link: target.link,
                removed: target.removed,
              },
            };
          }),
        );
        return { items };
      },
    );

    // Removing hides the item, closes its reports, and is logged, all in one
    // transaction.
    mod.post(
      "/moderation/:targetType/:targetId/remove",
      { schema: { params: targetParams, body: moderationReasonSchema } },
      async (request, reply) => {
        const moderator = requireUser(request);
        const { targetType, targetId } = request.params;
        if (!(await findTarget(targetType, targetId))) {
          throw new AppError(404, "NOT_FOUND", "That content doesn't exist");
        }
        await db.transaction(async (tx) => {
          await setRemoved(tx, targetType, targetId, true);
          await closeReports(tx, request.params, "resolved", moderator.id);
          await audit(tx, {
            actorId: moderator.id,
            action: "remove",
            targetType,
            targetId,
            reason: request.body.reason,
          });
        });
        return reply.status(204).send();
      },
    );

    mod.post(
      "/moderation/:targetType/:targetId/restore",
      { schema: { params: targetParams, body: moderationReasonSchema } },
      async (request, reply) => {
        const moderator = requireUser(request);
        const { targetType, targetId } = request.params;
        if (!(await findTarget(targetType, targetId))) {
          throw new AppError(404, "NOT_FOUND", "That content doesn't exist");
        }
        await db.transaction(async (tx) => {
          await setRemoved(tx, targetType, targetId, false);
          await audit(tx, {
            actorId: moderator.id,
            action: "restore",
            targetType,
            targetId,
            reason: request.body.reason,
          });
        });
        return reply.status(204).send();
      },
    );

    mod.post(
      "/moderation/:targetType/:targetId/dismiss",
      { schema: { params: targetParams } },
      async (request, reply) => {
        const moderator = requireUser(request);
        const { targetType, targetId } = request.params;
        await db.transaction(async (tx) => {
          await closeReports(tx, request.params, "dismissed", moderator.id);
          await audit(tx, {
            actorId: moderator.id,
            action: "dismiss_reports",
            targetType,
            targetId,
          });
        });
        return reply.status(204).send();
      },
    );

    // Bans end every session immediately (D12). Moderators can only ban
    // people ranked below them, and nobody can ban themselves.
    mod.post(
      "/moderation/users/:username/ban",
      { schema: { params: userParams, body: moderationReasonSchema } },
      async (request, reply) => {
        const moderator = requireUser(request);
        const target = await findUser(request.params.username);
        if (
          target.id === moderator.id ||
          ROLE_RANK[target.role] >= ROLE_RANK[moderator.role]
        ) {
          throw new AppError(403, "FORBIDDEN", "You can't ban this account");
        }
        await db.transaction(async (tx) => {
          await tx
            .update(users)
            .set({ bannedAt: new Date() })
            .where(eq(users.id, target.id));
          await tx.delete(sessions).where(eq(sessions.userId, target.id));
          await audit(tx, {
            actorId: moderator.id,
            action: "ban_user",
            targetType: "user",
            targetId: target.id,
            reason: request.body.reason,
          });
        });
        return reply.status(204).send();
      },
    );

    mod.post(
      "/moderation/users/:username/unban",
      { schema: { params: userParams, body: moderationReasonSchema } },
      async (request, reply) => {
        const moderator = requireUser(request);
        const target = await findUser(request.params.username);
        await db.transaction(async (tx) => {
          await tx
            .update(users)
            .set({ bannedAt: null })
            .where(eq(users.id, target.id));
          await audit(tx, {
            actorId: moderator.id,
            action: "unban_user",
            targetType: "user",
            targetId: target.id,
            reason: request.body.reason,
          });
        });
        return reply.status(204).send();
      },
    );

    mod.get(
      "/moderation/audit",
      { schema: { response: { 200: auditResponseSchema } } },
      async () => {
        const rows = await db
          .select({
            id: auditLog.id,
            actorUsername: users.username,
            action: auditLog.action,
            targetType: auditLog.targetType,
            targetId: auditLog.targetId,
            reason: auditLog.reason,
            createdAt: auditLog.createdAt,
          })
          .from(auditLog)
          .leftJoin(users, eq(users.id, auditLog.actorId))
          .orderBy(desc(auditLog.id))
          .limit(100);
        return {
          entries: rows.map(({ actorUsername, createdAt, ...row }) => ({
            ...row,
            actor: actorUsername ? { username: actorUsername } : null,
            createdAt: createdAt.toISOString(),
          })),
        };
      },
    );
  });
};

async function findUser(username: string) {
  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(sql`lower(${users.username}) = ${username.toLowerCase()}`);
  if (!user) throw new AppError(404, "NOT_FOUND", "No user with that name");
  return user;
}
