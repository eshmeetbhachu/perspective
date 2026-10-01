import Fastify, { type FastifyInstance } from "fastify";
import { loggerOptions } from "./config/logger";
import { pool } from "./db/client";
import { healthRoutes } from "./modules/health/routes";
import { errorHandler, notFoundHandler } from "./plugins/error-handler";

// Builds the app without starting it, so tests can call buildApp() and send
// fake requests with app.inject() (Phase 7). server.ts does the listening.
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: loggerOptions });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  // If the database drops an idle connection (restart, network blip), the pool
  // emits 'error'. Unhandled, that event would crash the whole process; here
  // we just log it, and the pool opens a fresh connection on the next query.
  pool.on("error", (err) => {
    app.log.error({ err }, "idle database connection error");
  });

  // On shutdown, close database connections after in-flight requests finish.
  app.addHook("onClose", async () => {
    await pool.end();
  });

  await app.register(healthRoutes);

  return app;
}
