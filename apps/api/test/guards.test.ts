import type { UserRole } from "@perspective/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { db } from "../src/db/client";
import { users } from "../src/db/schema";
import { requireRole, requireVerifiedEmail } from "../src/plugins/auth";
import { errorCode, get, register, resetDatabase } from "./helpers";

let app: FastifyInstance;

beforeEach(async () => {
  await resetDatabase();
  app = await buildApp();
  // Routes that exist only in this test, guarded the way real ones will be.
  app.get("/test/moderators", { preHandler: requireRole("moderator") }, () => ({
    ok: true,
  }));
  app.get("/test/admins", { preHandler: requireRole("admin") }, () => ({
    ok: true,
  }));
  app.get("/test/verified", { preHandler: requireVerifiedEmail }, () => ({
    ok: true,
  }));
});

afterEach(async () => {
  await app.close();
});

async function userWithRole(role: UserRole) {
  const { session, body } = await register(app);
  await db.update(users).set({ role }).where(eq(users.id, body.user.id));
  return session;
}

describe("requireRole", () => {
  it("asks anonymous visitors to log in", async () => {
    const response = await get(app, "/test/moderators");
    expect(response.statusCode).toBe(401);
  });

  it("blocks regular users from moderator routes", async () => {
    const session = await userWithRole("user");
    const response = await get(app, "/test/moderators", session);
    expect(response.statusCode).toBe(403);
    expect(errorCode(response)).toBe("FORBIDDEN");
  });

  it("lets moderators and admins into moderator routes", async () => {
    const moderator = await userWithRole("moderator");
    expect((await get(app, "/test/moderators", moderator)).statusCode).toBe(
      200,
    );

    await resetDatabase();
    const admin = await userWithRole("admin");
    expect((await get(app, "/test/moderators", admin)).statusCode).toBe(200);
  });

  it("keeps moderators out of admin routes", async () => {
    const moderator = await userWithRole("moderator");
    expect((await get(app, "/test/admins", moderator)).statusCode).toBe(403);
  });

  it("uses the current role, not the one at login", async () => {
    const { session, body } = await register(app);
    expect((await get(app, "/test/admins", session)).statusCode).toBe(403);

    await db
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.id, body.user.id));
    expect((await get(app, "/test/admins", session)).statusCode).toBe(200);
  });
});

describe("requireVerifiedEmail", () => {
  it("blocks unverified accounts with a specific code", async () => {
    const { session } = await register(app);
    const response = await get(app, "/test/verified", session);
    expect(response.statusCode).toBe(403);
    expect(errorCode(response)).toBe("EMAIL_NOT_VERIFIED");
  });

  it("lets verified accounts through", async () => {
    const { session, body } = await register(app);
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, body.user.id));
    expect((await get(app, "/test/verified", session)).statusCode).toBe(200);
  });
});
