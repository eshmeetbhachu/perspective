import Fastify, { type FastifyInstance } from "fastify";
import { loggerOptions } from "./config/logger";
import { healthRoutes } from "./modules/health/routes";
import { errorHandler, notFoundHandler } from "./plugins/error-handler";

// Builds the app without starting it, so tests can call buildApp() and send
// fake requests with app.inject() (Phase 7). server.ts does the listening.
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: loggerOptions });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  await app.register(healthRoutes);

  return app;
}
