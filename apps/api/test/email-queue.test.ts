import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { emailQueue, sendEmail } from "../src/mailer";
import { resetDatabase } from "./helpers";

const email = {
  to: "sam@example.com",
  subject: "Confirm your email for Perspective",
  text: "Open https://perspective.example/verify-email?token=abc",
};

let app: FastifyInstance;

beforeEach(async () => {
  await resetDatabase();
  app = await buildApp();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await app.close();
});

describe("email queue", () => {
  it("queues emails for the worker, with retries", async () => {
    if (!emailQueue) throw new Error("tests run with Redis");
    await sendEmail(email, app.log);

    const [job] = await emailQueue.getJobs(["waiting"]);
    expect(job?.data).toEqual(email);
    expect(job?.opts.attempts).toBe(8);
    // One-time links don't linger in Redis once the email is sent.
    expect(job?.opts.removeOnComplete).toBe(true);
  });

  it("sends right away when the queue is unreachable", async () => {
    if (!emailQueue) throw new Error("tests run with Redis");
    vi.spyOn(emailQueue, "add").mockRejectedValueOnce(new Error("Redis down"));
    const warn = vi.spyOn(app.log, "warn");
    const info = vi.spyOn(app.log, "info");

    await sendEmail(email, app.log);

    expect(warn).toHaveBeenCalledWith(
      expect.anything(),
      "email queue unavailable, sending now",
    );
    expect(info).toHaveBeenCalledWith(
      { to: "s***@example.com", subject: email.subject },
      expect.stringContaining("token=abc"),
    );
    expect(await emailQueue.getJobs(["waiting"])).toHaveLength(0);
  });
});
