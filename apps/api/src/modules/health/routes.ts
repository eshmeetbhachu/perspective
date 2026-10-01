import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  // Liveness: "is the process up?". A database (readiness) check is added
  // with Drizzle in Phase 0, step 6.
  // logLevel "warn": load balancers call this every few seconds, so normal
  // requests to it are not logged.
  app.get("/health", { logLevel: "warn" }, () => ({ status: "ok" }));
};
