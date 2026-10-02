import type {
  ErrorCode,
  ErrorDetail,
  ErrorResponse,
} from "@perspective/shared";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: ErrorDetail[];

  constructor(status: number, body: ErrorResponse) {
    super(body.error.message);
    this.status = status;
    this.code = body.error.code;
    this.details = body.error.details ?? [];
  }
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers:
      options.body === undefined
        ? undefined
        : { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => null)) as ErrorResponse | null;
    throw new ApiError(
      response.status,
      body ?? {
        error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
      },
    );
  }

  return (await response.json()) as T;
}
