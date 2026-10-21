import type { FastifyBaseLogger } from "fastify";
import { createTransport } from "nodemailer";
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

// Tests never send real email, even if .env has an SMTP server configured.
const transport =
  env.SMTP_URL && env.NODE_ENV !== "test"
    ? createTransport(env.SMTP_URL)
    : null;

export async function sendEmail(
  email: Email,
  log: FastifyBaseLogger,
): Promise<void> {
  if (!transport) {
    log.info(
      { to: maskEmail(email.to), subject: email.subject },
      `email (not sent, no SMTP_URL):\n\n${email.text}\n`,
    );
    return;
  }
  await transport.sendMail({ from: env.EMAIL_FROM, ...email });
  log.info({ to: maskEmail(email.to), subject: email.subject }, "email sent");
}
