import type { UserRole } from "@perspective/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors";
import {
  type AuthUser,
  clearSessionCookie,
  SESSION_COOKIE,
  setSessionCookie,
  validateSession,
} from "../modules/auth/sessions";

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
    sessionId: string | null;
  }
}

// Runs on every request: turns the session cookie into request.user.
export async function loadSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return;

  const result = await validateSession(token);
  if (!result) {
    clearSessionCookie(reply);
    return;
  }

  request.user = result.user;
  request.sessionId = result.sessionId;
  if (result.renewedUntil) {
    setSessionCookie(reply, token, result.renewedUntil);
  }
}

export function requireUser(request: FastifyRequest): AuthUser {
  if (!request.user) {
    throw new AppError(401, "UNAUTHENTICATED", "You need to log in");
  }
  return request.user;
}

export async function requireAuth(request: FastifyRequest): Promise<void> {
  requireUser(request);
}

export async function requireVerifiedEmail(
  request: FastifyRequest,
): Promise<void> {
  if (!requireUser(request).emailVerifiedAt) {
    throw new AppError(
      403,
      "EMAIL_NOT_VERIFIED",
      "Verify your email address first",
    );
  }
}

const ROLE_RANK: Record<UserRole, number> = { user: 0, moderator: 1, admin: 2 };

// Roles are ranked: requireRole("moderator") also lets admins through.
export function requireRole(minimum: UserRole) {
  return async (request: FastifyRequest): Promise<void> => {
    if (ROLE_RANK[requireUser(request).role] < ROLE_RANK[minimum]) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "You don't have permission to do that",
      );
    }
  };
}
