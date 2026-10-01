import type {
  ErrorCode,
  ErrorDetail,
  ErrorResponse,
} from "@perspective/shared";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors";

function errorBody(
  code: ErrorCode,
  message: string,
  details?: ErrorDetail[],
): ErrorResponse {
  return { error: details ? { code, message, details } : { code, message } };
}

// Every error thrown anywhere in a request ends up here (Decision D22).
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  // 1. Errors we threw on purpose: their message is meant for the client.
  if (error instanceof AppError) {
    return reply
      .status(error.statusCode)
      .send(errorBody(error.code, error.message, error.details));
  }

  // 2. Client mistakes Fastify detected itself (malformed JSON, body too
  //    large, unsupported content type). Fastify's messages are safe to show.
  const statusCode = error.statusCode ?? 500;
  if (statusCode >= 400 && statusCode < 500) {
    request.log.info({ err: error }, "client error");
    return reply
      .status(statusCode)
      .send(errorBody("BAD_REQUEST", error.message));
  }

  // 3. Anything else is a bug. Full details go to the log only; the client
  //    gets a generic message, because stack traces and SQL errors reveal
  //    how the system works.
  request.log.error({ err: error }, "unhandled error");
  return reply
    .status(500)
    .send(errorBody("INTERNAL_ERROR", "Something went wrong"));
}

export function notFoundHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  return reply
    .status(404)
    .send(
      errorBody(
        "NOT_FOUND",
        `Route ${request.method} ${request.url} not found`,
      ),
    );
}
