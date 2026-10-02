import type { GooglePendingResponse, UserResponse } from "@perspective/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { db } from "../src/db/client";
import { oauthPending, users } from "../src/db/schema";
import {
  exchangeGoogleCode,
  type GoogleIdentity,
} from "../src/modules/auth/google";
import {
  errorCode,
  findCookie,
  get,
  post,
  register,
  resetDatabase,
  sessionCookie,
} from "./helpers";

// Google itself is replaced; everything after "Google says this is user X"
// runs for real against the test database.
vi.mock("../src/modules/auth/google", () => ({
  isGoogleConfigured: () => true,
  createGoogleAuthorization: () =>
    Promise.resolve({
      url: new URL("https://accounts.google.com/o/oauth2/v2/auth?state=s1"),
      checks: { state: "s1", codeVerifier: "v1", nonce: "n1" },
    }),
  exchangeGoogleCode: vi.fn(),
}));

const exchange = vi.mocked(exchangeGoogleCode);
const WEB = "http://localhost:5173";

function googleSays(identity: Partial<GoogleIdentity> = {}) {
  exchange.mockResolvedValue({
    sub: "google-123",
    email: "sam@example.com",
    emailVerified: true,
    ...identity,
  });
}

let app: FastifyInstance;

beforeEach(async () => {
  await resetDatabase();
  exchange.mockReset();
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

// Runs the redirect round trip: /start, then Google calling /callback.
async function signInWithGoogle(
  options: { intent?: "login" | "link"; session?: string } = {},
) {
  const start = await app.inject({
    method: "GET",
    url: `/auth/google/start?intent=${options.intent ?? "login"}`,
    cookies: options.session ? { session: options.session } : {},
  });
  const state = findCookie(start, "google_oauth");
  const callback = await app.inject({
    method: "GET",
    url: "/auth/google/callback?code=one-time-code&state=s1",
    cookies: {
      ...(state ? { google_oauth: state.value } : {}),
      ...(options.session ? { session: options.session } : {}),
    },
  });
  return {
    start,
    callback,
    location: callback.headers.location,
    session: sessionCookie(callback)?.value,
    pending: findCookie(callback, "google_pending")?.value,
  };
}

function withPending(pending: string | undefined, session?: string) {
  return {
    ...(pending ? { google_pending: pending } : {}),
    ...(session ? { session } : {}),
  };
}

describe("starting Google sign-in", () => {
  it("reports Google as available", async () => {
    const response = await get(app, "/auth/providers");
    expect(response.json()).toEqual({ google: true });
  });

  it("redirects to Google and remembers the one-time checks", async () => {
    const { start } = await signInWithGoogle();
    expect(start.statusCode).toBe(302);
    expect(start.headers.location).toMatch(/^https:\/\/accounts\.google\.com/);
    expect(findCookie(start, "google_oauth")).toMatchObject({ httpOnly: true });
  });

  it("passes the remembered checks to the code exchange", async () => {
    googleSays();
    await signInWithGoogle();
    const [callbackUrl, checks] = exchange.mock.calls[0] ?? [];
    expect(callbackUrl?.searchParams.get("code")).toBe("one-time-code");
    expect(checks).toEqual({
      state: "s1",
      codeVerifier: "v1",
      nonce: "n1",
      intent: "login",
    });
  });
});

describe("new Google users", () => {
  it("pick a username, then get a verified account", async () => {
    googleSays();
    const { location, session, pending } = await signInWithGoogle();

    expect(location).toBe(`${WEB}/signup/google`);
    expect(session).toBeUndefined();

    const info = await app.inject({
      method: "GET",
      url: "/auth/google/pending",
      cookies: withPending(pending),
    });
    expect(info.json<GooglePendingResponse>()).toEqual({
      email: "sam@example.com",
      accountExists: false,
    });

    const complete = await app.inject({
      method: "POST",
      url: "/auth/google/complete",
      payload: { username: "sam" },
      headers: { origin: WEB },
      cookies: withPending(pending),
    });
    expect(complete.statusCode).toBe(201);
    expect(complete.json<UserResponse>().user).toMatchObject({
      username: "sam",
      emailVerified: true,
      googleConnected: true,
    });

    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.username, "sam"));
    expect(row?.passwordHash).toBeNull();
    expect(await db.select().from(oauthPending)).toHaveLength(0);
  });

  it("are logged straight in on their next Google sign-in", async () => {
    googleSays();
    const first = await signInWithGoogle();
    await app.inject({
      method: "POST",
      url: "/auth/google/complete",
      payload: { username: "sam" },
      headers: { origin: WEB },
      cookies: withPending(first.pending),
    });

    const again = await signInWithGoogle();
    expect(again.location).toBe(`${WEB}/account`);
    const me = await get(app, "/auth/me", again.session);
    expect(me.json<UserResponse>().user.username).toBe("sam");
  });

  it("can't finish without a pending sign-in", async () => {
    const response = await post(app, "/auth/google/complete", {
      username: "sam",
    });
    expect(response.statusCode).toBe(400);
  });

  it("can't finish after the pending sign-in expired", async () => {
    googleSays();
    const { pending } = await signInWithGoogle();
    await db
      .update(oauthPending)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    const response = await app.inject({
      method: "POST",
      url: "/auth/google/complete",
      payload: { username: "sam" },
      headers: { origin: WEB },
      cookies: withPending(pending),
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("existing accounts with the same email (D27)", () => {
  it("are not logged into by Google alone", async () => {
    await register(app);
    googleSays();
    const { location, session, pending } = await signInWithGoogle();

    expect(location).toBe(`${WEB}/login?link=google`);
    expect(session).toBeUndefined();

    const takeover = await app.inject({
      method: "POST",
      url: "/auth/google/complete",
      payload: { username: "attacker" },
      headers: { origin: WEB },
      cookies: withPending(pending),
    });
    expect(takeover.statusCode).toBe(409);
    expect(errorCode(takeover)).toBe("EMAIL_TAKEN");
  });

  it("connect Google once the owner logs in with their password", async () => {
    await register(app);
    googleSays();
    const { pending } = await signInWithGoogle();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "sam@example.com", password: "correct horse battery" },
      headers: { origin: WEB },
      cookies: withPending(pending),
    });
    expect(login.json<UserResponse>().user.googleConnected).toBe(true);

    const next = await signInWithGoogle();
    expect(next.location).toBe(`${WEB}/account`);
    expect(next.session).toBeDefined();
  });

  it("don't connect when the owner logs in to a different account", async () => {
    await register(app);
    await register(app, { username: "alex", email: "alex@example.com" });
    googleSays();
    const { pending } = await signInWithGoogle();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "alex@example.com", password: "correct horse battery" },
      headers: { origin: WEB },
      cookies: withPending(pending),
    });
    expect(login.json<UserResponse>().user.googleConnected).toBe(false);
    expect((await signInWithGoogle()).session).toBeUndefined();
  });
});

describe("connecting Google from the account page", () => {
  it("works for a logged-in user, whatever the Google email", async () => {
    const { session } = await register(app);
    googleSays({ email: "different@gmail.com" });

    const { location } = await signInWithGoogle({ intent: "link", session });
    expect(location).toBe(`${WEB}/account?google=connected`);

    const me = await get(app, "/auth/me", session);
    expect(me.json<UserResponse>().user.googleConnected).toBe(true);
  });

  it("refuses a Google account that belongs to someone else", async () => {
    const { session: sam } = await register(app);
    const { session: alex } = await register(app, {
      username: "alex",
      email: "alex@example.com",
    });
    googleSays();
    await signInWithGoogle({ intent: "link", session: sam });

    const { location } = await signInWithGoogle({
      intent: "link",
      session: alex,
    });
    expect(location).toBe(`${WEB}/account?error=google_conflict`);
  });
});

describe("rejected Google sign-ins", () => {
  it("rejects unverified Google emails", async () => {
    googleSays({ emailVerified: false });
    const { location, pending } = await signInWithGoogle();
    expect(location).toBe(`${WEB}/login?error=google_unverified`);
    expect(pending).toBeUndefined();
  });

  it("rejects a callback without the state cookie", async () => {
    googleSays();
    const response = await app.inject({
      method: "GET",
      url: "/auth/google/callback?code=one-time-code&state=s1",
    });
    expect(response.headers.location).toBe(`${WEB}/login?error=google_failed`);
    expect(exchange).not.toHaveBeenCalled();
  });

  it("rejects a callback that fails verification", async () => {
    exchange.mockRejectedValue(new Error("state mismatch"));
    const { location, session } = await signInWithGoogle();
    expect(location).toBe(`${WEB}/login?error=google_failed`);
    expect(session).toBeUndefined();
  });

  it("refuses suspended accounts", async () => {
    const { session, body } = await register(app);
    googleSays();
    await signInWithGoogle({ intent: "link", session });
    await db
      .update(users)
      .set({ bannedAt: new Date() })
      .where(eq(users.id, body.user.id));

    const { location } = await signInWithGoogle();
    expect(location).toBe(`${WEB}/login?error=account_suspended`);
  });
});
