// The API's error contract (Decision D22). The frontend switches on `code`;
// `message` is for humans and may change wording at any time.
export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "EMAIL_NOT_VERIFIED"
  | "NOT_FOUND"
  | "EMAIL_TAKEN"
  | "USERNAME_TAKEN"
  | "INVALID_CREDENTIALS"
  | "INVALID_TOKEN"
  | "STANCE_REQUIRED"
  | "STANCE_COOLDOWN"
  | "ALREADY_POSTED"
  | "ACCOUNT_TOO_NEW"
  | "OWN_POST"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE";

// One problem with one input field, e.g. { path: "email", message: "..." }.
export interface ErrorDetail {
  path: string;
  message: string;
}

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
  };
}
