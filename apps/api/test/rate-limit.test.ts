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

it("shares the limit between API instances", async () => {
  await resetDatabase();
  const other = await buildApp();
  const attempt = (instance: FastifyInstance) =>
    post(instance, "/auth/login", {
      email: "kim@example.com",
      password: "guess",
    });

  // Alternate between two instances, like a load balancer would.
  for (let i = 0; i < 10; i++) {
    expect((await attempt(i % 2 ? other : app)).statusCode).toBe(401);
  }
  expect((await attempt(other)).statusCode).toBe(429);
  await other.close();
});
