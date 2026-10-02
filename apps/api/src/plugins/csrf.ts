import type { FastifyRequest } from "fastify";
import { env } from "../config/env";
import { AppError } from "../errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Browsers always send Origin on cross-site POSTs and can't fake it, so
// requiring our own origin blocks other sites from acting with our cookies.
export async function checkOrigin(request: FastifyRequest): Promise<void> {
  if (SAFE_METHODS.has(request.method)) return;

  if (request.headers.origin !== env.WEB_ORIGIN) {
    throw new AppError(403, "FORBIDDEN", "Cross-site request blocked");
  }
}
