import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { env } from "./config/env";
import { loggerOptions } from "./config/logger";
import { AppError } from "./errors";
import { emailRoutes } from "./modules/auth/email-routes";
import { googleRoutes } from "./modules/auth/google-routes";
import { authRoutes } from "./modules/auth/routes";
import { challengeRoutes } from "./modules/challenges/routes";
import { threadRoutes } from "./modules/challenges/thread";
import { healthRoutes } from "./modules/health/routes";
import { moderationRoutes } from "./modules/moderation/routes";
import { notificationRoutes } from "./modules/notifications/routes";
import { postRoutes } from "./modules/posts/routes";
import { questionRoutes } from "./modules/questions/routes";
import { stanceRoutes } from "./modules/stances/routes";
import { voteRoutes } from "./modules/votes/routes";
import { loadSession } from "./plugins/auth";
import { checkOrigin } from "./plugins/csrf";
import { errorHandler, notFoundHandler } from "./plugins/error-handler";

// Builds the app without starting it, so tests can call buildApp() and send
// fake requests with app.inject() (Phase 7). server.ts does the listening.
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions,
    trustProxy: env.TRUST_PROXY ?? false,
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Only JSON bodies: a plain HTML form on another site can send text/plain
  // without the browser asking our permission first.
  app.removeContentTypeParser("text/plain");

  await app.register(helmet);
  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) =>
      new AppError(
        429,
        "RATE_LIMITED",
        `Too many attempts, try again in ${context.after}`,
      ),
  });

  app.decorateRequest("user", null);
  app.decorateRequest("sessionId", null);
  app.addHook("onRequest", checkOrigin);
  app.addHook("onRequest", loadSession);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(googleRoutes);
  await app.register(emailRoutes);
  await app.register(questionRoutes);
  await app.register(stanceRoutes);
  await app.register(postRoutes);
  await app.register(voteRoutes);
  await app.register(challengeRoutes);
  await app.register(threadRoutes);
  await app.register(notificationRoutes);
  await app.register(moderationRoutes);

  return app;
}
