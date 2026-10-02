import { spawnSync } from "node:child_process";
import type { ErrorResponse } from "@perspective/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { get } from "./helpers";

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

describe("health checks", () => {
  it("report the process as alive", async () => {
    const response = await get(app, "/health");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("report the database as reachable", async () => {
    const response = await get(app, "/health/ready");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});

describe("errors", () => {
  it("hide the details of unexpected failures from the client", async () => {
    app.get("/test/crash", () => {
      throw new Error("password=hunter2 leaked from a bug");
    });
    const response = await get(app, "/test/crash");
    expect(response.statusCode).toBe(500);
    expect(response.json<ErrorResponse>()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
    });
    expect(response.body).not.toContain("hunter2");
  });

  it("explain unknown routes in the usual error shape", async () => {
    const response = await get(app, "/no/such/route");
    expect(response.statusCode).toBe(404);
    expect(response.json<ErrorResponse>().error.code).toBe("NOT_FOUND");
  });

  it("reject broken JSON as a bad request", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: "{ not json",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<ErrorResponse>().error.code).toBe("BAD_REQUEST");
  });
});

describe("startup", () => {
  // Phase 0 promise: the API refuses to start with a missing or invalid
  // setting, and says which one without printing its value.
  it("refuses to start without a valid configuration", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "-e", "await import('./src/config/env.ts')"],
      {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          SYSTEMROOT: process.env.SYSTEMROOT,
          PORT: "not-a-port",
          DATABASE_URL: "",
        },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid environment configuration");
    expect(result.stderr).toContain("DATABASE_URL");
    expect(result.stderr).toContain("PORT");
    expect(result.stderr).not.toContain("not-a-port");
  });
});
