import {
  forgotPasswordSchema,
  resetPasswordSchema,
  userResponseSchema,
  verifyEmailSchema,
} from "@perspective/shared";
import { eq, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { db } from "../../db/client";
import { sessions, users } from "../../db/schema";
import { AppError } from "../../errors";
import { requireUser } from "../../plugins/auth";
import {
  consumeToken,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "./email-tokens";
import { hashPassword } from "./passwords";
import { authUserColumns, startSession, toPublicUser } from "./sessions";

const invalidLink = () =>
  new AppError(400, "INVALID_TOKEN", "This link is invalid or has expired");

const markVerified = {
  emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
};

export const emailRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/auth/email/verify/send",
    { config: { rateLimit: { max: 3, timeWindow: 15 * 60_000 } } },
    async (request, reply) => {
      const user = requireUser(request);
      if (!user.emailVerifiedAt) {
        await sendVerificationEmail(user, request.log);
      }
      return reply.status(204).send();
    },
  );

  // The emailed link opens a page that POSTs the token. A plain GET link
  // would be "clicked" by email scanners that preview links.
  app.post(
    "/auth/email/verify",
    {
      config: { rateLimit: { max: 20, timeWindow: 15 * 60_000 } },
      schema: { body: verifyEmailSchema },
    },
    async (request, reply) => {
      const userId = await consumeToken(request.body.token, "verify_email");
      if (!userId) throw invalidLink();

      await db.update(users).set(markVerified).where(eq(users.id, userId));
      return reply.status(204).send();
    },
  );

  // Always the same answer, so this can't be used to find out who has an
  // account.
  app.post(
    "/auth/password/forgot",
    {
      config: { rateLimit: { max: 5, timeWindow: 60 * 60_000 } },
      schema: { body: forgotPasswordSchema },
    },
    async (request, reply) => {
      const [user] = await db
        .select(authUserColumns)
        .from(users)
        .where(sql`lower(${users.email}) = ${request.body.email}`);

      if (user && !user.bannedAt) {
        try {
          await sendPasswordResetEmail(user, request.log);
        } catch (err) {
          request.log.error({ err }, "password reset email failed");
        }
      }
      return reply.status(204).send();
    },
  );

  app.post(
    "/auth/password/reset",
    {
      config: { rateLimit: { max: 10, timeWindow: 60 * 60_000 } },
      schema: {
        body: resetPasswordSchema,
        response: { 200: userResponseSchema },
      },
    },
    async (request, reply) => {
      const userId = await consumeToken(request.body.token, "reset_password");
      if (!userId) throw invalidLink();

      const passwordHash = await hashPassword(request.body.password);
      // Reset proves control of the inbox, so it also verifies the email, and
      // every existing session (maybe an attacker's) is logged out.
      const user = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(users)
          .set({ passwordHash, ...markVerified })
          .where(eq(users.id, userId))
          .returning(authUserColumns);
        await tx.delete(sessions).where(eq(sessions.userId, userId));
        return updated;
      });
      if (!user) throw invalidLink();
      if (user.bannedAt) {
        throw new AppError(403, "FORBIDDEN", "This account has been suspended");
      }

      await startSession(request, reply, user.id);
      return { user: toPublicUser(user) };
    },
  );
};
