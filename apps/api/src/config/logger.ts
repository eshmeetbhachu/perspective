import type { FastifyRequest, FastifyServerOptions } from "fastify";
import { env } from "./env";

const SECRET_PARAMS = new Set(["code", "state", "token"]);

// Hides one-time values in logged URLs, e.g. Google's ?code= on the callback.
export function redactUrl(url: string): string {
  const [path, query] = url.split("?", 2);
  if (!query) return url;
  const params = query
    .split("&")
    .map((pair) => {
      const name = pair.split("=", 1)[0] ?? "";
      return SECRET_PARAMS.has(name) ? `${name}=REDACTED` : pair;
    })
    .join("&");
  return `${path ?? ""}?${params}`;
}

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
  serializers: {
    req: (request: FastifyRequest) => ({
      method: request.method,
      url: redactUrl(request.url),
      remoteAddress: request.ip,
    }),
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
