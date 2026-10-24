import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { pino } from "pino";
import { env } from "./config/env";
import { loggerOptions } from "./config/logger";
import { deliverEmail, EMAIL_QUEUE, type Email, maskEmail } from "./mailer";

// Sends queued emails (D70). Runs as its own process, `node dist/worker.js`,
// so a slow or failing email provider never holds up an API request.
const log = pino(loggerOptions);

if (!env.REDIS_URL) {
  log.fatal("REDIS_URL is required to run the worker");
  process.exit(1);
}

// Workers wait on Redis with blocking commands, which need their own
// connection that retries forever instead of failing requests.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker<Email>(
  EMAIL_QUEUE,
  async (job) => {
    await deliverEmail(job.data, log);
  },
  { connection, concurrency: 5 },
);

worker.on("failed", (job, err) => {
  log.warn(
    {
      err,
      to: job ? maskEmail(job.data.to) : undefined,
      attempt: job?.attemptsMade,
    },
    "email failed",
  );
});
worker.on("error", (err) => {
  log.error({ err }, "worker error");
});
log.info("email worker started");

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  log.info({ signal }, "shutting down");
  // Lets the email being sent finish; queued ones wait for the next start.
  await worker.close();
  connection.disconnect();
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}
