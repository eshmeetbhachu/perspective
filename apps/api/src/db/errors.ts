// Returns the constraint name when a query failed on a unique index.
// Drizzle wraps the driver's error, so the Postgres details sit on `cause`.
export function uniqueViolation(err: unknown): string | undefined {
  const cause = err instanceof Error ? err.cause : undefined;
  if (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === "23505" &&
    "constraint" in cause &&
    typeof cause.constraint === "string"
  ) {
    return cause.constraint;
  }
  return undefined;
}
