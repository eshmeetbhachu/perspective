import { createHash, randomBytes } from "node:crypto";
import type { PublicUser } from "@perspective/shared";
import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { sessions, users } from "../../db/schema";

export const SESSION_COOKIE = "session";

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_LIFETIME_MS = 30 * DAY_MS;
const RENEW_WITHIN_MS = 15 * DAY_MS;

export type AuthUser = Omit<typeof users.$inferSelect, "passwordHash">;

// Every user column except the password hash.
export const authUserColumns = {
  id: users.id,
  username: users.username,
  email: users.email,
  role: users.role,
  emailVerifiedAt: users.emailVerifiedAt,
  bannedAt: users.bannedAt,
  createdAt: users.createdAt,
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  request: FastifyRequest,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ip: request.ip,
    userAgent: request.headers["user-agent"]?.slice(0, 500),
  });

  return { token, expiresAt };
}

// Returns null for unknown, expired, or banned sessions. Sessions that are
// past half their lifetime get extended, so active users stay logged in.
export async function validateSession(token: string): Promise<{
  sessionId: string;
  user: AuthUser;
  renewedUntil: Date | null;
} | null> {
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      user: authUserColumns,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashToken(token)));

  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now() || row.user.bannedAt) {
    await deleteSession(row.sessionId);
    return null;
  }

  let renewedUntil: Date | null = null;
  if (row.expiresAt.getTime() - Date.now() < RENEW_WITHIN_MS) {
    renewedUntil = new Date(Date.now() + SESSION_LIFETIME_MS);
    await db
      .update(sessions)
      .set({ expiresAt: renewedUntil })
      .where(eq(sessions.id, row.sessionId));
  }

  return { sessionId: row.sessionId, user: row.user, renewedUntil };
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

// Logging in always issues a brand-new token and drops any previous one, so a
// token planted in the browser before login can't become a logged-in session.
export async function startSession(
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
): Promise<void> {
  if (request.sessionId) {
    await deleteSession(request.sessionId);
  }
  const { token, expiresAt } = await createSession(userId, request);
  setSessionCookie(reply, token, expiresAt);
}

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function toPublicUser(user: AuthUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
  };
}
