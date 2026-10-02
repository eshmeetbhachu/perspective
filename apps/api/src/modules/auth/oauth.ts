import { and, eq, gt } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../../db/client";
import { uniqueViolation } from "../../db/errors";
import { oauthAccounts, oauthPending } from "../../db/schema";
import type { GoogleIdentity } from "./google";
import { cookieOptions } from "./sessions";
import { hashToken, newToken } from "./tokens";

export const PENDING_COOKIE = "google_pending";
const PENDING_LIFETIME_MS = 15 * 60 * 1000;

export async function createPending(
  reply: FastifyReply,
  identity: GoogleIdentity,
): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + PENDING_LIFETIME_MS);
  await db.insert(oauthPending).values({
    tokenHash: hashToken(token),
    provider: "google",
    providerUserId: identity.sub,
    email: identity.email,
    expiresAt,
  });
  reply.setCookie(PENDING_COOKIE, token, cookieOptions(expiresAt));
}

export async function findPending(request: FastifyRequest) {
  const token = request.cookies[PENDING_COOKIE];
  if (!token) return null;

  const [pending] = await db
    .select()
    .from(oauthPending)
    .where(
      and(
        eq(oauthPending.tokenHash, hashToken(token)),
        gt(oauthPending.expiresAt, new Date()),
      ),
    );
  return pending ?? null;
}

export async function deletePending(
  reply: FastifyReply,
  pendingId: string,
): Promise<void> {
  await db.delete(oauthPending).where(eq(oauthPending.id, pendingId));
  reply.clearCookie(PENDING_COOKIE, { path: "/" });
}

// False when this Google account belongs to someone else, or the user already
// has a different Google account connected.
export async function linkGoogle(
  userId: string,
  googleUserId: string,
): Promise<boolean> {
  try {
    await db
      .insert(oauthAccounts)
      .values({ provider: "google", providerUserId: googleUserId, userId });
    return true;
  } catch (err) {
    if (uniqueViolation(err)) return false;
    throw err;
  }
}

// Called after a successful password login. Connects a waiting Google sign-in
// only if it carries this account's email: logging in proved control (D27).
export async function linkPendingGoogle(
  request: FastifyRequest,
  reply: FastifyReply,
  user: { id: string; email: string },
): Promise<boolean> {
  const pending = await findPending(request);
  if (!pending) return false;

  await deletePending(reply, pending.id);
  if (pending.email !== user.email.toLowerCase()) return false;
  return linkGoogle(user.id, pending.providerUserId);
}
