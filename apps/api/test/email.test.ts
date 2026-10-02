import type { UserResponse } from "@perspective/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { db } from "../src/db/client";
import { emailTokens, users } from "../src/db/schema";
import { maskEmail, sendEmail } from "../src/mailer";
import {
  errorCode,
  get,
  post,
  register,
  resetDatabase,
  sessionCookie,
} from "./helpers";

vi.mock("../src/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/mailer")>()),
  sendEmail: vi.fn(),
}));

const sent = vi.mocked(sendEmail);

// The token from the most recent email's link.
function lastLinkToken(): string {
  const email = sent.mock.lastCall?.[0];
  const token = email?.text.match(/token=([\w-]+)/)?.[1];
  if (!token) throw new Error("no link in the last email");
  return token;
}

let app: FastifyInstance;

beforeEach(async () => {
  await resetDatabase();
  sent.mockReset();
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

describe("email verification", () => {
  it("sends a link on sign-up that verifies the email once", async () => {
    const { session } = await register(app);
    expect(sent).toHaveBeenCalledOnce();
    expect(sent.mock.lastCall?.[0]).toMatchObject({
      to: "sam@example.com",
      subject: "Confirm your email for Perspective",
    });

    const token = lastLinkToken();
    const first = await post(app, "/auth/email/verify", { token });
    expect(first.statusCode).toBe(204);

    const me = await get(app, "/auth/me", session);
    expect(me.json<UserResponse>().user.emailVerified).toBe(true);

    const again = await post(app, "/auth/email/verify", { token });
    expect(again.statusCode).toBe(400);
    expect(errorCode(again)).toBe("INVALID_TOKEN");
  });

  it("rejects expired links", async () => {
    await register(app);
    const token = lastLinkToken();
    await db
      .update(emailTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    const response = await post(app, "/auth/email/verify", { token });
    expect(errorCode(response)).toBe("INVALID_TOKEN");
  });

  it("makes older links stop working when a new one is sent", async () => {
    const { session } = await register(app);
    const oldToken = lastLinkToken();

    await post(app, "/auth/email/verify/send", undefined, session);
    expect(sent).toHaveBeenCalledTimes(2);

    expect(
      (await post(app, "/auth/email/verify", { token: oldToken })).statusCode,
    ).toBe(400);
    expect(
      (await post(app, "/auth/email/verify", { token: lastLinkToken() }))
        .statusCode,
    ).toBe(204);
  });

  it("doesn't resend once the email is verified", async () => {
    const { session } = await register(app);
    await post(app, "/auth/email/verify", { token: lastLinkToken() });
    sent.mockClear();

    const response = await post(
      app,
      "/auth/email/verify/send",
      undefined,
      session,
    );
    expect(response.statusCode).toBe(204);
    expect(sent).not.toHaveBeenCalled();
  });

  it("needs a session to resend", async () => {
    const response = await post(app, "/auth/email/verify/send");
    expect(response.statusCode).toBe(401);
  });
});

describe("password reset", () => {
  it("answers the same whether or not the email has an account", async () => {
    await register(app);
    sent.mockClear();

    const unknown = await post(app, "/auth/password/forgot", {
      email: "nobody@example.com",
    });
    expect(unknown.statusCode).toBe(204);
    expect(sent).not.toHaveBeenCalled();

    const known = await post(app, "/auth/password/forgot", {
      email: "SAM@example.com",
    });
    expect(known.statusCode).toBe(204);
    expect(sent.mock.lastCall?.[0].subject).toBe(
      "Reset your Perspective password",
    );
  });

  it("sets the new password, logs out old sessions, and logs in", async () => {
    const { session: oldSession } = await register(app);
    await post(app, "/auth/password/forgot", { email: "sam@example.com" });

    const reset = await post(app, "/auth/password/reset", {
      token: lastLinkToken(),
      password: "a brand new passphrase",
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json<UserResponse>().user.emailVerified).toBe(true);
    expect(sessionCookie(reset)?.value).toBeTruthy();

    expect((await get(app, "/auth/me", oldSession)).statusCode).toBe(401);

    const oldPassword = await post(app, "/auth/login", {
      email: "sam@example.com",
      password: "correct horse battery",
    });
    expect(oldPassword.statusCode).toBe(401);
    const newPassword = await post(app, "/auth/login", {
      email: "sam@example.com",
      password: "a brand new passphrase",
    });
    expect(newPassword.statusCode).toBe(200);
  });

  it("uses each reset link only once", async () => {
    await register(app);
    await post(app, "/auth/password/forgot", { email: "sam@example.com" });
    const token = lastLinkToken();

    const results = await Promise.all([
      post(app, "/auth/password/reset", {
        token,
        password: "first new passphrase",
      }),
      post(app, "/auth/password/reset", {
        token,
        password: "second new passphrase",
      }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400]);
  });

  it("rejects reset links older than 30 minutes", async () => {
    await register(app);
    await post(app, "/auth/password/forgot", { email: "sam@example.com" });
    const token = lastLinkToken();
    await db
      .update(emailTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    const response = await post(app, "/auth/password/reset", {
      token,
      password: "a brand new passphrase",
    });
    expect(errorCode(response)).toBe("INVALID_TOKEN");
  });

  it("lets an account without a password set one", async () => {
    const { body } = await register(app);
    await db
      .update(users)
      .set({ passwordHash: null })
      .where(eq(users.id, body.user.id));

    await post(app, "/auth/password/forgot", { email: "sam@example.com" });
    await post(app, "/auth/password/reset", {
      token: lastLinkToken(),
      password: "a brand new passphrase",
    });

    const login = await post(app, "/auth/login", {
      email: "sam@example.com",
      password: "a brand new passphrase",
    });
    expect(login.statusCode).toBe(200);
  });

  it("sends nothing to suspended accounts", async () => {
    const { body } = await register(app);
    await db
      .update(users)
      .set({ bannedAt: new Date() })
      .where(eq(users.id, body.user.id));
    sent.mockClear();

    await post(app, "/auth/password/forgot", { email: "sam@example.com" });
    expect(sent).not.toHaveBeenCalled();
  });
});

it("masks email addresses for logs", () => {
  expect(maskEmail("sam@example.com")).toBe("s***@example.com");
});
