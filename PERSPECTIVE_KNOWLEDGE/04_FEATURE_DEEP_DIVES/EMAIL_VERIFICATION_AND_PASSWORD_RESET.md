# Feature: Email Verification and Password Reset

**User-facing purpose:** prove you own your email address (required before asking, posting, voting, challenging or commenting), and recover your account if you forget your password.

## Pieces

| Layer  | Files                                                                                                                                                                              |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages  | `VerifyEmailPage.tsx` (`/verify-email?token=`), `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx` (`/reset-password?token=`), `AccountPage.tsx` and `AskPage.tsx` (resend buttons) |
| Hooks  | `useVerifyEmail`, `useResendVerification`, `useForgotPassword`, `useResetPassword` in `auth.ts`                                                                                    |
| API    | `modules/auth/email-tokens.ts`, `email-routes.ts`, `src/mailer.ts`, `src/worker.ts` (lab)                                                                                          |
| Tables | `email_tokens`, `users`, `sessions`                                                                                                                                                |

## Endpoints

| Route                          | Guard / limit         | Behaviour                                                                                                                                   |
| ------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/email/verify/send` | logged in; 3 / 15 min | Sends a new link if not yet verified; 204 either way                                                                                        |
| `POST /auth/email/verify`      | 20 / 15 min           | `{ token }` → consume → set `email_verified_at` (if not already) → 204; bad/expired/used → 400 `INVALID_TOKEN`                              |
| `POST /auth/password/forgot`   | 5 / hour              | `{ email }` → if an account exists and isn't banned, send a reset link; **always 204**                                                      |
| `POST /auth/password/reset`    | 10 / hour             | `{ token, password }` → consume → hash → set password + verify email + delete all sessions (one transaction) → new session → 200 `{ user }` |

## The token mechanism (`email-tokens.ts`)

```ts
async function issueToken(userId, purpose) {
  const token = newToken(); // 32 random bytes, base64url
  await db.transaction(async (tx) => {
    await tx.delete(emailTokens).where(and(eq(userId), eq(purpose))); // older links stop working
    await tx.insert(emailTokens).values({
      userId,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + LIFETIME_MS[purpose]),
    }); // 24 h or 30 min
  });
  return token; // only goes into the email
}

export async function consumeToken(token, purpose) {
  const [row] = await db
    .delete(emailTokens)
    .where(
      and(
        eq(tokenHash, hashToken(token)),
        eq(purpose, purpose),
        gt(expiresAt, new Date()),
      ),
    )
    .returning({ userId: emailTokens.userId });
  return row?.userId ?? null;
}
```

- **Why `DELETE ... RETURNING` in one statement:** Postgres locks the row while deleting it; a second simultaneous request finds nothing to delete and gets `null`. A `SELECT` followed by a `DELETE` would let both requests read the row first, so both would succeed. This makes tokens **strictly single-use**.
- **Why `purpose` is checked:** a verification token can't be used as a password-reset token.
- **Why the transaction in `issueToken`:** "delete old, insert new" must happen together; otherwise a crash between them could leave the user with no valid link, or two.
- **Expired tokens** are simply never matched; they're cleaned up the next time a link of that kind is issued, or when the user is deleted (cascade).

## Why the link opens a page instead of verifying directly

The email contains `https://<site>/verify-email?token=...`. Opening it loads the React page, which **POSTs** the token. Corporate email scanners and link previewers fetch every link in an email (a GET) to check it for malware. If GET verified the email or consumed a reset token, the scanner would silently use up the link before the person clicks it (D35).

**A subtle frontend choice** (`auth.ts:110`): `useVerifyEmail` is a TanStack **query**, not a mutation, with `staleTime: Infinity` and `retry: false`. In development, React's `StrictMode` mounts components twice; a mutation fired in an effect would run twice, and the second call would fail as "already used". A query with a stable key runs once and caches its result.

## Password reset details

```ts
const passwordHash = await hashPassword(request.body.password);
const user = await db.transaction(async (tx) => {
  const [updated] = await tx.update(users)
    .set({ passwordHash, emailVerifiedAt: sql`coalesce(email_verified_at, now())` })
    .where(eq(users.id, userId)).returning(authUserColumns);
  await tx.delete(sessions).where(eq(sessions.userId, userId));
  return updated;
});
if (user.bannedAt) throw new AppError(403, ...);
await startSession(request, reply, user.id);
```

- **Verifies the email:** clicking a link sent to the inbox proves ownership. `coalesce` keeps the original verification time if there was one.
- **Ends every session:** people reset passwords after a suspected compromise; an attacker's session must die.
- **Logs you in:** a better experience than "now go and log in".
- **Works for Google-only accounts:** it sets a password where there was none (test `email.test.ts:193`).
- **Banned accounts:** forgot-password sends nothing to them (`email-routes.ts:72`), and a reset would be refused.

## The "same answer" rule for forgot-password

The response is always 204 with no body, and the page always says "if an account exists, we sent a link". Otherwise the form would tell anyone whether an email address has an account here. The emailing happens inside a `try/catch`, so a failing email provider doesn't change the response either.

## Email delivery

`sendEmail` → with Redis: a BullMQ job (8 attempts, exponential backoff starting at 5 s. The code comment in `mailer.ts:35` says "about 20 minutes", but by BullMQ's formula the 7 waits are 5+10+20+40+80+160+320 s ≈ 10.5 minutes, plus the time spent on each attempt; completed jobs deleted immediately and failed ones after 24 h, because emails contain one-time links) → `worker.ts` → `deliverEmail`. Without Redis (production): `deliverEmail` directly. Without `SMTP_URL` (development): the full email is logged so you can copy the link. Production refuses to start without `SMTP_URL` (`env.ts:54`).

**Production provider:** Brevo SMTP on port 2525 (D63). Emails come from the owner's address via Brevo; without a custom domain authenticated with SPF/DKIM/DMARC, they may land in spam.

## Edge cases

| Case                                 | Result                                                            |
| ------------------------------------ | ----------------------------------------------------------------- |
| Link clicked twice                   | Second time: "Link not valid"                                     |
| Two links requested, old one clicked | Invalid (issuing deleted it)                                      |
| Reset link after 30 minutes          | 400 `INVALID_TOKEN` (test `email.test.ts:178`)                    |
| Verify while logged out              | Works; the page offers "Log in" afterwards                        |
| Resend after verification            | 204, nothing sent (`email.test.ts:93`)                            |
| Email provider down during sign-up   | Sign-up succeeds; email lost in prod (logged), retried in the lab |

## Tests

`apps/api/test/email.test.ts` (mocks only `sendEmail`, to capture links) and `email-queue.test.ts` (queue with retries; falls back to sending now when the queue is unreachable).
