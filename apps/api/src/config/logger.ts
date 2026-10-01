import type { FastifyServerOptions } from "fastify";
import { env } from "./env";

export const loggerOptions: FastifyServerOptions["logger"] = {
  level: env.LOG_LEVEL,

  // Never write secrets to logs (security checklist). Any logged object with
  // these fields gets the value replaced by "[Redacted]".
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "password",
      "*.password",
      "token",
      "*.token",
    ],
    censor: "[Redacted]",
  },

  // Development: human-readable colored lines. Everywhere else: raw JSON,
  // one object per line, which log tools can search and filter.
  ...(env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : {}),
};
