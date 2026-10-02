import type { FastifyBaseLogger } from "fastify";
import { env } from "./config/env";

export interface Email {
  to: string;
  subject: string;
  text: string;
}

// sam@example.com -> s***@example.com, so logs don't hold full addresses.
export function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 1)}***@${domain}`;
}

// Development prints emails to the API log instead of sending them. A real
// provider is added with deployment (Phase 8).
export async function sendEmail(
  email: Email,
  log: FastifyBaseLogger,
): Promise<void> {
  if (env.NODE_ENV === "production") {
    throw new Error("No email provider is configured");
  }
  log.info(
    { to: maskEmail(email.to), subject: email.subject },
    `email (not sent in development):\n\n${email.text}\n`,
  );
}
