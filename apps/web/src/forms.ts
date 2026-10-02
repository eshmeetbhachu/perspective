import type { ZodType } from "zod";
import { ApiError } from "./api";

export type FieldErrors = Partial<Record<string, string>>;

// First message per field, from a failed client-side schema check.
export function validate<T>(
  schema: ZodType<T>,
  values: unknown,
): { data: T; errors: null } | { data: null; errors: FieldErrors } {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: null };

  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0]);
    errors[field] ??= issue.message;
  }
  return { data: null, errors };
}

const FIELD_FOR_CODE: Partial<Record<string, string>> = {
  EMAIL_TAKEN: "email",
  USERNAME_TAKEN: "username",
};

// Turns an API error into per-field messages, plus one for the whole form.
export function errorsFromApi(err: unknown): {
  fields: FieldErrors;
  form: string | null;
} {
  if (!(err instanceof ApiError)) {
    return { fields: {}, form: "Can't reach the server. Try again." };
  }

  const fields: FieldErrors = {};
  for (const detail of err.details) {
    fields[detail.path] ??= detail.message;
  }
  const field = FIELD_FOR_CODE[err.code];
  if (field) {
    fields[field] = err.message;
    return { fields, form: null };
  }
  return { fields, form: err.details.length > 0 ? null : err.message };
}
