import {
  loginSchema,
  registerSchema,
  userResponseSchema,
} from "@perspective/shared";
import { sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { db } from "../../db/client";
import { users } from "../../db/schema";
import { AppError } from "../../errors";
import { requireUser } from "../../plugins/auth";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "./passwords";
import { sendVerificationEmail } from "./email-tokens";
import { linkPendingGoogle } from "./oauth";
import {
  authUserColumns,
  clearSessionCookie,
  deleteSession,
  startSession,
  toPublicUser,
} from "./sessions";
import { insertUser } from "./users";

function rateLimit(max: number, minutes: number) {
  return { rateLimit: { max, timeWindow: minutes * 60_000 } };
}

const invalidCredentials = () =>
  new AppError(401, "INVALID_CREDENTIALS", "Wrong email or password");

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/auth/register",
    {
      config: rateLimit(5, 60),
      schema: { body: registerSchema, response: { 201: userResponseSchema } },
    },
    async (request, reply) => {
      const { username, email, password } = request.body;
      const user = await insertUser({
        username,
        email,
        passwordHash: await hashPassword(password),
      });
      await startSession(request, reply, user.id);
      try {
        await sendVerificationEmail(user, request.log);
      } catch (err) {
        request.log.error({ err }, "verification email failed");
      }
      return reply.status(201).send({ user: toPublicUser(user) });
    },
  );

  app.post(
    "/auth/login",
    {
      config: rateLimit(10, 15),
      schema: { body: loginSchema, response: { 200: userResponseSchema } },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const [user] = await db
        .select({ ...authUserColumns, passwordHash: users.passwordHash })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`);

      if (!user?.passwordHash) {
        await verifyAgainstDummy(password);
        throw invalidCredentials();
      }
      if (!(await verifyPassword(user.passwordHash, password))) {
        throw invalidCredentials();
      }
      if (user.bannedAt) {
        throw new AppError(403, "FORBIDDEN", "This account has been suspended");
      }

      const googleLinked = await linkPendingGoogle(request, reply, user);
      await startSession(request, reply, user.id);
      return {
        user: toPublicUser({
          ...user,
          googleConnected: user.googleConnected || googleLinked,
        }),
      };
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    if (request.sessionId) {
      await deleteSession(request.sessionId);
    }
    clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.get(
    "/auth/me",
    { schema: { response: { 200: userResponseSchema } } },
    async (request) => ({ user: toPublicUser(requireUser(request)) }),
  );
};
