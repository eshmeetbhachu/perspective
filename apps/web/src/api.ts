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

const WAKE_TIMEOUT_MS = 120_000;
const WAKE_RETRY_MS = 3_000;

// The free API host stops the API after 15 idle minutes, and requests through
// our /api proxy don't start it again (they get an instant 502). A direct
// request to its public health check does (D64).
export function wakeApi(): void {
  const url = import.meta.env.VITE_API_WAKE_URL;
  if (url) fetch(url, { mode: "no-cors" }).catch(() => undefined);
}

// A 502 means the request never reached the API, so it is safe to resend.
async function send(path: string, init: RequestInit): Promise<Response> {
  const giveUpAt = Date.now() + WAKE_TIMEOUT_MS;
  for (;;) {
    const response = await fetch(`/api${path}`, init);
    if (
      response.status !== 502 ||
      !import.meta.env.VITE_API_WAKE_URL ||
      Date.now() > giveUpAt
    ) {
      return response;
    }
    wakeApi();
    await new Promise((resolve) => setTimeout(resolve, WAKE_RETRY_MS));
  }
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await send(path, {
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
