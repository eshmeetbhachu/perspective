import type { ErrorResponse, UserResponse } from "@perspective/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { db } from "../src/db/client";
import { sessions, users } from "../src/db/schema";
import {
  errorCode,
  get,
  post,
  register,
  resetDatabase,
  sessionCookie,
} from "./helpers";

let app: FastifyInstance;

// A fresh app per test also means fresh rate-limit counters.
beforeEach(async () => {
  await resetDatabase();
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

describe("register", () => {
  it("creates the account and logs the user in", async () => {
    const response = await post(app, "/auth/register", {
      username: "Sam_1",
      email: "  Sam@Example.com ",
      password: "correct horse battery",
    });

    expect(response.statusCode).toBe(201);
    const { user } = response.json<UserResponse>();
    expect(user).toMatchObject({
      username: "Sam_1",
      email: "sam@example.com",
      role: "user",
      emailVerified: false,
    });
    expect(user).not.toHaveProperty("passwordHash");

    const cookie = sessionCookie(response);
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    });

    const me = await get(app, "/auth/me", cookie?.value);
    expect(me.json<UserResponse>().user.id).toBe(user.id);
  });

  it("stores a password hash and a token hash, never the secrets", async () => {
    const { session, body } = await register(app);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, body.user.id));
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);

    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, body.user.id));
    expect(row?.tokenHash).toHaveLength(64);
    expect(row?.tokenHash).not.toBe(session);
  });

  it("rejects an email that differs only in capitals", async () => {
    await register(app);
    const response = await post(app, "/auth/register", {
      username: "someone_else",
      email: "SAM@example.com",
      password: "correct horse battery",
    });
    expect(response.statusCode).toBe(409);
    expect(errorCode(response)).toBe("EMAIL_TAKEN");
  });

  it("rejects a username that differs only in capitals", async () => {
    await register(app);
    const response = await post(app, "/auth/register", {
      username: "SAM",
      email: "other@example.com",
      password: "correct horse battery",
    });
    expect(response.statusCode).toBe(409);
    expect(errorCode(response)).toBe("USERNAME_TAKEN");
  });

  it("explains every invalid field", async () => {
    const response = await post(app, "/auth/register", {
      username: "no spaces!",
      email: "not-an-email",
      password: "short",
    });
    expect(response.statusCode).toBe(400);
    const { error } = response.json<ErrorResponse>();
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.details?.map((detail) => detail.path).sort()).toEqual([
      "email",
      "password",
      "username",
    ]);
  });
});

describe("login", () => {
  it("logs in with the right password", async () => {
    await register(app);
    const response = await post(app, "/auth/login", {
      email: "SAM@example.com",
      password: "correct horse battery",
    });
    expect(response.statusCode).toBe(200);
    expect(sessionCookie(response)?.value).toBeTruthy();
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    await register(app);
    const wrongPassword = await post(app, "/auth/login", {
      email: "sam@example.com",
      password: "wrong password here",
    });
    const unknownEmail = await post(app, "/auth/login", {
      email: "nobody@example.com",
      password: "wrong password here",
    });

    for (const response of [wrongPassword, unknownEmail]) {
      expect(response.statusCode).toBe(401);
      expect(response.json<ErrorResponse>().error).toEqual({
        code: "INVALID_CREDENTIALS",
        message: "Wrong email or password",
      });
    }
  });

  it("replaces the previous session instead of reusing it", async () => {
    const { session: before } = await register(app);
    const response = await post(
      app,
      "/auth/login",
      { email: "sam@example.com", password: "correct horse battery" },
      before,
    );
    const after = sessionCookie(response)?.value;

    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
    expect((await get(app, "/auth/me", before)).statusCode).toBe(401);
  });

  it("refuses banned accounts and ends their sessions", async () => {
    const { session, body } = await register(app);
    await db
      .update(users)
      .set({ bannedAt: new Date() })
      .where(eq(users.id, body.user.id));

    expect((await get(app, "/auth/me", session)).statusCode).toBe(401);
    const login = await post(app, "/auth/login", {
      email: "sam@example.com",
      password: "correct horse battery",
    });
    expect(login.statusCode).toBe(403);
  });
});

describe("sessions", () => {
  it("requires a session for /auth/me", async () => {
    const response = await get(app, "/auth/me");
    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe("UNAUTHENTICATED");
  });

  it("logout ends the session", async () => {
    const { session } = await register(app);
    const response = await post(app, "/auth/logout", undefined, session);
    expect(response.statusCode).toBe(204);
    expect((await get(app, "/auth/me", session)).statusCode).toBe(401);
  });

  it("rejects expired sessions", async () => {
    const { session, body } = await register(app);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, body.user.id));
    expect((await get(app, "/auth/me", session)).statusCode).toBe(401);
  });

  it("extends sessions that are past half their lifetime", async () => {
    const { session, body } = await register(app);
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db
      .update(sessions)
      .set({ expiresAt: soon })
      .where(eq(sessions.userId, body.user.id));

    const response = await get(app, "/auth/me", session);
    const renewed = sessionCookie(response);
    expect(renewed?.value).toBe(session);
    expect(renewed?.expires?.getTime()).toBeGreaterThan(soon.getTime());
  });
});

describe("cross-site protection", () => {
  it("blocks state-changing requests from other origins", async () => {
    const payload = { email: "sam@example.com", password: "whatever" };
    const noOrigin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload,
    });
    const evilOrigin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload,
      headers: { origin: "https://evil.example" },
    });

    for (const response of [noOrigin, evilOrigin]) {
      expect(response.statusCode).toBe(403);
      expect(errorCode(response)).toBe("FORBIDDEN");
    }
  });

  it("refuses non-JSON bodies", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: "email=sam@example.com",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "text/plain",
      },
    });
    expect(response.statusCode).toBe(415);
  });
});
