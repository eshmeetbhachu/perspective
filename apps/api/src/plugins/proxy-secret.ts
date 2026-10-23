import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { env } from "../config/env";
import { AppError } from "../errors";

// The host's health checks call the API directly, without the proxy.
const OPEN_PATHS = new Set(["/health", "/health/ready"]);

// Hashing first gives both sides the same length, which timingSafeEqual needs.
function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

// The API's own address is public too. Without this check, anyone could call
// it directly, skip the proxy, and claim any IP address (D61).
export async function requireProxySecret(
  request: FastifyRequest,
): Promise<void> {
  if (!env.ORIGIN_SECRET) return;
  if (OPEN_PATHS.has(request.url.split("?", 1)[0] ?? "")) return;

  const given = request.headers["x-origin-secret"];
  if (typeof given !== "string" || !sameSecret(given, env.ORIGIN_SECRET)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Requests must come through the website",
    );
  }
}
