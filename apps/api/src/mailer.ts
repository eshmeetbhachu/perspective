import { type JobsOptions, Queue } from "bullmq";
import type { FastifyBaseLogger } from "fastify";
import { createTransport } from "nodemailer";
import { redis } from "./cache";
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

export const EMAIL_QUEUE = "email";

// With Redis, emails are queued and sent by the worker (src/worker.ts), which
// retries when the provider is down. Without it they're sent during the
// request, as before (D70).
export const emailQueue = redis
  ? new Queue<Email>(EMAIL_QUEUE, { connection: redis })
  : null;

const jobOptions: JobsOptions = {
  // 8 tries over about 20 minutes: 5 s, 10 s, 20 s, ...
  attempts: 8,
  backoff: { type: "exponential", delay: 5_000 },
  // Emails hold one-time links, so they don't stay in Redis once sent.
  removeOnComplete: true,
  removeOnFail: { age: 24 * 60 * 60 },
};

export async function sendEmail(
  email: Email,
  log: FastifyBaseLogger,
): Promise<void> {
  if (emailQueue) {
    try {
      await emailQueue.add("send", email, jobOptions);
      return;
    } catch (err) {
      log.warn({ err }, "email queue unavailable, sending now");
    }
  }
  await deliverEmail(email, log);
}

export async function deliverEmail(
  email: Email,
  log: Pick<FastifyBaseLogger, "info">,
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
