import {
  completeGoogleSignupSchema,
  googlePendingResponseSchema,
  providersResponseSchema,
  userResponseSchema,
} from "@perspective/shared";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { oauthAccounts, oauthPending, users } from "../../db/schema";
import { AppError } from "../../errors";
import {
  createGoogleAuthorization,
  exchangeGoogleCode,
  isGoogleConfigured,
} from "./google";
import { createPending, deletePending, findPending, linkGoogle } from "./oauth";
import { cookieOptions, startSession, toPublicUser } from "./sessions";
import { insertUser } from "./users";

const STATE_COOKIE = "google_oauth";
const STATE_LIFETIME_MS = 10 * 60 * 1000;

const savedStateSchema = z.object({
  state: z.string(),
  codeVerifier: z.string(),
  nonce: z.string(),
  intent: z.enum(["login", "link"]),
});

function parseSavedState(cookie: string | undefined) {
  if (!cookie) return null;
  try {
    const result = savedStateSchema.safeParse(JSON.parse(cookie));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function redirectToWeb(reply: FastifyReply, path: string) {
  return reply.redirect(`${env.WEB_ORIGIN}${path}`);
}

export const googleRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/auth/providers",
    { schema: { response: { 200: providersResponseSchema } } },
    () => ({ google: isGoogleConfigured() }),
  );

  // Step 1: send the browser to Google, remembering the one-time values the
  // callback must match (state, PKCE verifier, nonce) in a short-lived cookie.
  app.get(
    "/auth/google/start",
    {
      config: { rateLimit: { max: 30, timeWindow: 15 * 60_000 } },
      schema: {
        querystring: z.object({
          intent: z.enum(["login", "link"]).default("login"),
        }),
      },
    },
    async (request, reply) => {
      if (!isGoogleConfigured()) {
        throw new AppError(404, "NOT_FOUND", "Google sign-in is not set up");
      }
      const { intent } = request.query;
      if (intent === "link" && !request.user) {
        return redirectToWeb(reply, "/login");
      }

      const { url, checks } = await createGoogleAuthorization();
      reply.setCookie(
        STATE_COOKIE,
        JSON.stringify({ ...checks, intent }),
        cookieOptions(new Date(Date.now() + STATE_LIFETIME_MS)),
      );
      return reply.redirect(url.href);
    },
  );

  // Step 2: Google sends the browser back here with a one-time code.
  app.get(
    "/auth/google/callback",
    { config: { rateLimit: { max: 30, timeWindow: 15 * 60_000 } } },
    async (request, reply) => {
      const saved = parseSavedState(request.cookies[STATE_COOKIE]);
      reply.clearCookie(STATE_COOKIE, { path: "/" });
      if (!saved) return redirectToWeb(reply, "/login?error=google_failed");

      const callbackUrl = new URL(env.GOOGLE_REDIRECT_URI);
      callbackUrl.search = new URL(request.url, env.WEB_ORIGIN).search;
      if (callbackUrl.searchParams.has("error")) {
        return redirectToWeb(reply, "/login?error=google_cancelled");
      }

      let identity;
      try {
        identity = await exchangeGoogleCode(callbackUrl, saved);
      } catch (err) {
        request.log.warn({ err }, "google sign-in failed");
        return redirectToWeb(reply, "/login?error=google_failed");
      }
      if (!identity.emailVerified) {
        return redirectToWeb(reply, "/login?error=google_unverified");
      }

      const [linked] = await db
        .select({ userId: oauthAccounts.userId, bannedAt: users.bannedAt })
        .from(oauthAccounts)
        .innerJoin(users, eq(users.id, oauthAccounts.userId))
        .where(
          and(
            eq(oauthAccounts.provider, "google"),
            eq(oauthAccounts.providerUserId, identity.sub),
          ),
        );

      // Connecting Google from the account page: being logged in is the proof.
      if (saved.intent === "link") {
        const user = request.user;
        if (!user) return redirectToWeb(reply, "/login");
        if (linked?.userId === user.id) {
          return redirectToWeb(reply, "/account?google=connected");
        }
        const ok = !linked && (await linkGoogle(user.id, identity.sub));
        return redirectToWeb(
          reply,
          ok ? "/account?google=connected" : "/account?error=google_conflict",
        );
      }

      if (linked) {
        if (linked.bannedAt) {
          return redirectToWeb(reply, "/login?error=account_suspended");
        }
        await startSession(request, reply, linked.userId);
        return redirectToWeb(reply, "/account");
      }

      // Unknown Google account: never sign in to an existing account just
      // because the email matches. Hold it until the owner proves control.
      await createPending(reply, identity);
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${identity.email}`);
      return redirectToWeb(
        reply,
        existing ? "/login?link=google" : "/signup/google",
      );
    },
  );

  app.get(
    "/auth/google/pending",
    { schema: { response: { 200: googlePendingResponseSchema } } },
    async (request) => {
      const pending = await findPending(request);
      if (!pending) {
        throw new AppError(404, "NOT_FOUND", "No Google sign-in in progress");
      }
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${pending.email}`);
      return { email: pending.email, accountExists: Boolean(existing) };
    },
  );

  // New Google users pick a username, then the account is created.
  app.post(
    "/auth/google/complete",
    {
      config: { rateLimit: { max: 10, timeWindow: 60 * 60_000 } },
      schema: {
        body: completeGoogleSignupSchema,
        response: { 201: userResponseSchema },
      },
    },
    async (request, reply) => {
      const pending = await findPending(request);
      if (!pending) {
        throw new AppError(
          400,
          "BAD_REQUEST",
          "Your Google sign-in expired. Please start again.",
        );
      }

      const user = await db.transaction(async (tx) => {
        const created = await insertUser(
          {
            username: request.body.username,
            email: pending.email,
            emailVerifiedAt: new Date(),
          },
          tx,
        );
        await tx.insert(oauthAccounts).values({
          provider: "google",
          providerUserId: pending.providerUserId,
          userId: created.id,
        });
        await tx.delete(oauthPending).where(eq(oauthPending.id, pending.id));
        return created;
      });

      await deletePending(reply, pending.id);
      await startSession(request, reply, user.id);
      return reply
        .status(201)
        .send({ user: toPublicUser({ ...user, googleConnected: true }) });
    },
  );
};
