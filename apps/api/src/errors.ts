import type { ErrorCode, ErrorDetail } from "@perspective/shared";

// An expected error that is safe to show the client, e.g.
//   throw new AppError(404, "NOT_FOUND", "Question not found");
// Anything else that gets thrown is treated as a bug and becomes a generic 500.
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details: ErrorDetail[] | undefined;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: ErrorDetail[],
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
