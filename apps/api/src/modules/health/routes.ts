import { sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { db } from "../../db/client";
import { AppError } from "../../errors";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  // Liveness: "is the process up?" Never touches the database, so a
  // database outage doesn't make the platform restart a healthy process.
  // logLevel "warn": load balancers call these every few seconds, so normal
  // requests to them are not logged.
  app.get("/health", { logLevel: "warn" }, () => ({ status: "ok" }));

  // Readiness: "can this process actually serve requests?"
  app.get("/health/ready", { logLevel: "warn" }, async (request) => {
    try {
      await db.execute(sql`select 1`);
    } catch (err) {
      request.log.warn({ err }, "database unreachable");
      throw new AppError(503, "SERVICE_UNAVAILABLE", "Database unavailable");
    }
    return { status: "ok" };
  });
};
