import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { errorCode, post, resetDatabase } from "./helpers";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await resetDatabase();
});

afterAll(async () => {
  await app.close();
});

it("slows down repeated login attempts", async () => {
  const attempt = () =>
    post(app, "/auth/login", { email: "sam@example.com", password: "guess" });

  for (let i = 0; i < 10; i++) {
    expect((await attempt()).statusCode).toBe(401);
  }

  const blocked = await attempt();
  expect(blocked.statusCode).toBe(429);
  expect(errorCode(blocked)).toBe("RATE_LIMITED");
  expect(blocked.headers["retry-after"]).toBeDefined();
});
