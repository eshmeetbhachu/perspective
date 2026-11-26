# Feature: Email and Password Accounts

**User-facing purpose:** create an account with a username, email and password; log in; stay logged in for weeks; log out.

## Pieces

| Layer  | Files                                                                                                                                         |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages  | `apps/web/src/pages/SignupPage.tsx`, `LoginPage.tsx`, `AccountPage.tsx`; `components/AuthLayout.tsx`, `Field.tsx`, `SiteHeader.tsx` (log out) |
| Hooks  | `apps/web/src/auth.ts`: `useRegister`, `useLogin`, `useLogout`, `useCurrentUser`                                                              |
| Shared | `packages/shared/src/users.ts`: `registerSchema`, `loginSchema`, `usernameSchema`, `emailSchema`, `passwordSchema`, `publicUserSchema`        |
| API    | `apps/api/src/modules/auth/routes.ts`, `sessions.ts`, `passwords.ts`, `tokens.ts`, `users.ts`; `plugins/auth.ts`                              |
| Tables | `users`, `sessions` (and `oauth_pending`/`oauth_accounts` for the optional Google link at login)                                              |

## Endpoints

| Method + path         | Guard / limit        | Body             | Success                               | Errors                                                                    |
| --------------------- | -------------------- | ---------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| `POST /auth/register` | 5 per hour per IP    | `registerSchema` | 201 `{ user }` + `Set-Cookie session` | 400 `VALIDATION_FAILED`; 409 `EMAIL_TAKEN` / `USERNAME_TAKEN`; 429        |
| `POST /auth/login`    | 10 per 15 min per IP | `loginSchema`    | 200 `{ user }` + cookie               | 401 `INVALID_CREDENTIALS`; 403 `FORBIDDEN` (banned); 429                  |
| `POST /auth/logout`   | none                 | none             | 204, cookie cleared                   | none                                                                      |
| `GET /auth/me`        | none                 | none             | 200 `{ user }`                        | 401 `UNAUTHENTICATED` (the frontend turns this into `null`, "logged out") |

## Validation rules (shared, used in both browser and API)

```ts
usernameSchema = z.string().regex(/^[A-Za-z0-9_]{3,20}$/, "...")      // also a DB check constraint
emailSchema    = z.string().trim().toLowerCase().pipe(z.email(...).max(254))
passwordSchema = z.string().min(12).max(128)                            // sign-up and reset only
loginSchema    = { email: emailSchema, password: z.string().min(1).max(128) }
```

- `.trim().toLowerCase()` runs **before** `.pipe(z.email())`, so `"  Sam@Mail.COM "` is cleaned and then checked. The API receives the cleaned value. That's why `lower(email) = $1` can compare directly with the input.
- 254 is the maximum length of an email address in practice (an SMTP path limit).
- The username rule exists three times on purpose: the shared Zod schema (both sides) and a database `check` constraint (`users_username_format`). The database copy protects against bugs in code that bypasses the schema (scripts, future endpoints).

## Sign-up, step by step (`auth/routes.ts:32`)

```ts
const user = await insertUser({
  username,
  email,
  passwordHash: await hashPassword(password),
});
await startSession(request, reply, user.id);
try {
  await sendVerificationEmail(user, request.log);
} catch (err) {
  request.log.error({ err }, "verification email failed");
}
return reply.status(201).send({ user: toPublicUser(user) });
```

1. **Hash first.** `hashPassword` = argon2id (19 MiB, 2 passes). The plain password is never stored or logged (`password` is in Pino's redact list).
2. **Insert, and let the database settle uniqueness.** `insertUser` (`users.ts`) catches error code `23505` and maps the constraint name: `users_email_lower_unique` → `EMAIL_TAKEN`, `users_username_lower_unique` → `USERNAME_TAKEN`. Checking with a `SELECT` first wouldn't be safe under concurrency: two sign-ups could both see "free".
3. **Log in immediately** (new session + cookie).
4. **Send the verification email, but don't fail sign-up if email fails.** The account exists, and the user can resend from `/account`. (In the lab with Redis, the email is queued instead.)
5. **Respond with the public user.** `toPublicUser` builds `{ id, username, email, role, emailVerified, googleConnected, createdAt }`. The response schema would strip `passwordHash` anyway; it is never selected (`authUserColumns`).

## Login, step by step (`auth/routes.ts:61`)

Traced in full in [REQUEST_RESPONSE_FLOWS.md, Flow 1](../01_ARCHITECTURE/REQUEST_RESPONSE_FLOWS.md#flow-1-logging-in). The important design points:

- **Constant-time-ish failure:** unknown email → `verifyAgainstDummy(password)` performs a real argon2 verification against a hash computed once at startup (`passwords.ts:19`, a top-level `await`). Without it, "unknown email" would answer in ~1 ms and "wrong password" in ~50 ms, which reveals which emails are registered.
- **Google-only accounts** have `password_hash = null`; they take the same dummy path and get the same error.
- **Ban check after the password check**, so only someone who knows the password learns the account is suspended.
- **`startSession` replaces any previous session** in this browser (session-fixation defence).

## Staying logged in

- The cookie lasts 30 days. `validateSession` extends it to 30 days again once fewer than 15 remain (`sessions.ts:76`), so active users effectively never get logged out.
- Expired or banned sessions are deleted the moment they're used.

## Logout

API: delete the session row, clear the cookie. Frontend (`SiteHeader.tsx:120`):

```ts
onNavigate(); // close the phone menu
void navigate("/"); // leave first...
logout.mutate(); // ...then clear the user
```

**Why navigate first:** on a members-only page, `RequireAuth` would see the user become `null` and redirect to `/login`. Navigating home first avoids that. This was a real bug caught by the E2E auth test during the November redesign ([BUGS_AND_FIXES.md](../08_BUGS_AND_DEBUGGING/BUGS_AND_FIXES.md)).

## Frontend behaviour

- `useCurrentUser` calls `/auth/me` once; 401 becomes `null`, so "logged out" is a normal state, not an error. Every component reads the same cached `["me"]`.
- Login and register put the returned user straight into `["me"]`, so the UI updates instantly without a refetch.
- `LoginPage` redirects to `next` if you're already logged in. `next` passes through `safeRedirect`, so only same-site paths are followed.

## Edge cases

| Case                                           | Behaviour                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| Email differs only in capitals                 | 409 `EMAIL_TAKEN` (test `auth.test.ts:75`)                                  |
| Two sign-ups with the same email at once       | One succeeds; the other gets 409 from the unique index                      |
| Log in while already logged in as someone else | Old session row deleted, new one created                                    |
| Browser sends a cookie for a deleted session   | `loadSession` clears the cookie; the request continues as anonymous         |
| Password with 200 characters                   | 400 (max 128): keeps hashing cost bounded                                   |
| Sign-up from another website's form            | 403 from `checkOrigin`, or 415/400 for non-JSON bodies (`auth.test.ts:214`) |

## Tests

`apps/api/test/auth.test.ts`: register (hash stored, not password; capitals; field errors), login (same answer for wrong password and unknown email; session replaced; banned refused), sessions (expiry, renewal, logout), cross-site protection. E2E `e2e/tests/auth.spec.ts`: full sign-up → confirm email → log out → log in through the real UI.

## Not implemented

Change password while logged in; delete account; list or end other sessions. See [KNOWN_LIMITATIONS.md](../08_BUGS_AND_DEBUGGING/KNOWN_LIMITATIONS.md).
