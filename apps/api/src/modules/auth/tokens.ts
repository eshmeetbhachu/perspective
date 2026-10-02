import { createHash, randomBytes } from "node:crypto";

// Secret tokens (sessions, pending sign-ins, email links) are random and only
// their SHA-256 hash is stored, so a database leak can't be replayed.
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
