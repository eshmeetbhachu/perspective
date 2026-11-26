# Authentication and Authorization: Security View

The mechanics are in [AUTHENTICATION_ARCHITECTURE.md](../01_ARCHITECTURE/AUTHENTICATION_ARCHITECTURE.md) and [ROLES_AND_GUARDS.md](../04_FEATURE_DEEP_DIVES/ROLES_AND_GUARDS.md). This page lists the security properties and how each is guaranteed.

## Authentication properties

| Property                                            | Guaranteed by                                                 | Test                                         |
| --------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| Passwords are never stored                          | argon2id; `password` redacted from logs                       | `auth.test.ts:58`                            |
| Session tokens are never stored                     | SHA-256 in `sessions.token_hash`                              | `auth.test.ts:58`                            |
| A session can be ended immediately                  | DB lookup on every request; logout, reset and ban delete rows | `auth.test.ts:183`, `moderation.test.ts:320` |
| Sessions expire                                     | 30-day `expires_at`, checked per request                      | `auth.test.ts:190`                           |
| Login can't be used to discover accounts            | same error and timing                                         | `auth.test.ts:125`                           |
| A planted token can't become a logged-in session    | `startSession` always issues a new token                      | `auth.test.ts:145`                           |
| Email links are single-use and short-lived          | `DELETE … RETURNING`, expiry, newer link cancels older        | `email.test.ts`                              |
| Google can't be used to take over existing accounts | D27 pending flow                                              | `google.test.ts:201`                         |
| After login, users only go to our own pages         | `safeRedirect`: `next` must start with `/` but not `//`       | (UI)                                         |

## Authorization properties

| Property                                   | Guaranteed by                                                   | Test                                                               |
| ------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| Every write requires a session             | `requireUser` / guards in every write handler                   | many                                                               |
| Content creation requires a verified email | `requireVerifiedEmail` on ask/post/vote/challenge/comment       | `posts.test.ts:150`, `votes.test.ts:134`, `challenges.test.ts:167` |
| Only authors edit or delete their content  | `findOwnPost`; comment author check                             | `posts.test.ts:278`                                                |
| Moderation is for moderators               | encapsulated scope with `requireRole("moderator")`              | `moderation.test.ts:154`, `:310`; `guards.test.ts`                 |
| Role changes apply immediately             | role read from DB per request                                   | `guards.test.ts:67`                                                |
| Moderators can't ban peers or superiors    | rank check                                                      | `moderation.test.ts:344`                                           |
| Private data is private                    | every notification query filters by the current user            | `challenges.test.ts:370`                                           |
| The UI can't grant access                  | `RequireAuth` and role checks are display-only; the API decides | E2E `moderation.spec.ts:77`                                        |

## Account enumeration: what is and isn't revealed

| Endpoint                      | Reveals account existence?                           | Why                                                          |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| Login                         | No                                                   | generic error, equal timing                                  |
| Forgot password               | No                                                   | always 204                                                   |
| Sign-up                       | **Yes** (409 `EMAIL_TAKEN`)                          | accepted trade-off for usability (D31), limited to 5/hour/IP |
| Google `/auth/google/pending` | Yes, but only for the email Google verified as yours | needs a valid pending cookie                                 |
| Ban by username               | Yes (404 "No user")                                  | moderators only                                              |

## Known gaps (RECOMMENDATIONS)

1. **Unban has no rank check** (`moderation/routes.ts:262`).
2. **No per-account brute-force protection:** limits are per IP.
3. **No session management UI:** users can't see or end their other sessions (the schema is ready: `sessions.id`, `ip`, `user_agent`, `sessions_user_id_idx`).
4. **No 2FA.**
5. **Expired sessions are only deleted when presented:** old rows accumulate until someone uses them. Harmless for security (they're rejected), a small storage cost.
