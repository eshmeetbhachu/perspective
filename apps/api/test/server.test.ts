import { spawnSync } from "node:child_process";
import type { ErrorResponse } from "@perspective/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { env } from "../src/config/env";
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

describe("client address", () => {
  const forwarded = { "x-forwarded-for": "198.51.100.7, 203.0.113.9" };

  it("ignores X-Forwarded-For when no proxy is trusted", async () => {
    app.get("/test/ip", (request) => ({ ip: request.ip }));
    const response = await app.inject({ url: "/test/ip", headers: forwarded });
    expect(response.json()).toEqual({ ip: "127.0.0.1" });
  });

  it("takes the address our trusted proxy saw", async () => {
    // Injected requests come from 127.0.0.1, standing in for the proxy.
    env.TRUST_PROXY = "127.0.0.1";
    const proxied = await buildApp().finally(() => {
      env.TRUST_PROXY = undefined;
    });
    proxied.get("/test/ip", (request) => ({ ip: request.ip }));

    const response = await proxied.inject({
      url: "/test/ip",
      headers: forwarded,
    });
    // 203.0.113.9 isn't a trusted proxy, so anything left of it could
    // have been written by the client and is ignored.
    expect(response.json()).toEqual({ ip: "203.0.113.9" });
    await proxied.close();
  });
});

describe("behind the website's proxy (ORIGIN_SECRET)", () => {
  const secret = "s".repeat(40);
  let proxied: FastifyInstance;

  beforeEach(async () => {
    env.ORIGIN_SECRET = secret;
    proxied = await buildApp();
    proxied.get("/test/ip", (request) => ({ ip: request.ip }));
  });

  afterEach(async () => {
    env.ORIGIN_SECRET = undefined;
    await proxied.close();
  });

  it("refuses requests that skip the proxy", async () => {
    for (const headers of [{}, { "x-origin-secret": "guess" }]) {
      const response = await proxied.inject({ url: "/questions", headers });
      expect(response.statusCode).toBe(403);
    }
  });

  it("still answers the host's health checks directly", async () => {
    const response = await proxied.inject({ url: "/health" });
    expect(response.statusCode).toBe(200);
  });

  it("takes the visitor address the proxy reports", async () => {
    const response = await proxied.inject({
      url: "/test/ip",
      headers: {
        "x-origin-secret": secret,
        // The proxy wrote the visitor; the host's load balancer added itself.
        "x-forwarded-for": "198.51.100.7, 10.0.0.5",
      },
    });
    expect(response.json()).toEqual({ ip: "198.51.100.7" });
  });
});

describe("responses", () => {
  it("are never stored by shared caches", async () => {
    const response = await get(app, "/health");
    expect(response.headers["cache-control"]).toBe("no-store");
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

  it("refuses to run in production without a way to send email", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "-e", "await import('./src/config/env.ts')"],
      {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          SYSTEMROOT: process.env.SYSTEMROOT,
          NODE_ENV: "production",
          DATABASE_URL: "postgres://app:secret@localhost:5432/perspective",
        },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("SMTP_URL");
  });

  it("matches WEB_ORIGIN even when it is written with a trailing slash", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        "const { env } = await import('./src/config/env.ts'); console.log(env.WEB_ORIGIN)",
      ],
      {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          SYSTEMROOT: process.env.SYSTEMROOT,
          DATABASE_URL: "postgres://app:secret@localhost:5432/perspective",
          WEB_ORIGIN: "https://perspective.example/",
        },
      },
    );
    expect(result.stdout.trim()).toBe("https://perspective.example");
  });
});
