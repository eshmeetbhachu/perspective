import { and, eq, gt } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { emailTokens } from "../../db/schema";
import { sendEmail } from "../../mailer";
import { hashToken, newToken } from "./tokens";

type Purpose = (typeof emailTokens.$inferSelect)["purpose"];

const LIFETIME_MS: Record<Purpose, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 30 * 60 * 1000,
};

// Issuing a new link invalidates older links of the same kind.
async function issueToken(userId: string, purpose: Purpose): Promise<string> {
  const token = newToken();
  await db.transaction(async (tx) => {
    await tx
      .delete(emailTokens)
      .where(
        and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose)),
      );
    await tx.insert(emailTokens).values({
      userId,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + LIFETIME_MS[purpose]),
    });
  });
  return token;
}

// Deleting and reading in one statement makes tokens strictly single-use:
// two simultaneous clicks can't both get the user id back.
export async function consumeToken(
  token: string,
  purpose: Purpose,
): Promise<string | null> {
  const [row] = await db
    .delete(emailTokens)
    .where(
      and(
        eq(emailTokens.tokenHash, hashToken(token)),
        eq(emailTokens.purpose, purpose),
        gt(emailTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: emailTokens.userId });
  return row?.userId ?? null;
}

export async function sendVerificationEmail(
  user: { id: string; email: string; username: string },
  log: FastifyBaseLogger,
): Promise<void> {
  const token = await issueToken(user.id, "verify_email");
  await sendEmail(
    {
      to: user.email,
      subject: "Confirm your email for Perspective",
      text: [
        `Hi ${user.username},`,
        "",
        "Confirm your email address by opening this link:",
        `${env.WEB_ORIGIN}/verify-email?token=${token}`,
        "",
        "The link works for 24 hours.",
      ].join("\n"),
    },
    log,
  );
}

export async function sendPasswordResetEmail(
  user: { id: string; email: string; username: string },
  log: FastifyBaseLogger,
): Promise<void> {
  const token = await issueToken(user.id, "reset_password");
  await sendEmail(
    {
      to: user.email,
      subject: "Reset your Perspective password",
      text: [
        `Hi ${user.username},`,
        "",
        "Choose a new password by opening this link:",
        `${env.WEB_ORIGIN}/reset-password?token=${token}`,
        "",
        "The link works for 30 minutes. If you didn't ask for this, ignore this email.",
      ].join("\n"),
    },
    log,
  );
}
