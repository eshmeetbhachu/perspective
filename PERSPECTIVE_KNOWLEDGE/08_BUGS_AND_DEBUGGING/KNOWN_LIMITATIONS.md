# Known Limitations

Everything that is missing, partial or imperfect, as of commit `cdd117f`. Each item is labelled **FACT** (verified in code or live) and has a **RECOMMENDATION** where one applies.

## Product features not built

| #   | Limitation                                                                 | Evidence                                                                 | Recommendation                                                                        |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 1   | No "change password" while logged in                                       | No such route (only `/auth/password/forgot` and `/reset`)                | `POST /auth/password/change` requiring the current password; end other sessions       |
| 2   | No account deletion                                                        | No route; tests delete users directly in SQL                             | See [SECURITY_TRADEOFFS.md](../07_SECURITY/SECURITY_TRADEOFFS.md) #6; adjust counters |
| 3   | No session list / "log out other devices"                                  | Schema ready (`sessions.id`, `ip`, `user_agent`), no route or UI         | Add both                                                                              |
| 4   | No user profile pages                                                      | The roadmap's module layout mentions `users/ profiles`; no module exists | Optional                                                                              |
| 5   | Comments can't be edited                                                   | D48 "not edited yet"                                                     | Add `edited_at` like posts                                                            |
| 6   | Review-first publishing unused                                             | `question_status` has `pending`; nothing sets it                         | Use it if spam grows (D37 made this a code change, not a migration)                   |
| 7   | Notifications: latest 30 only, all-or-nothing read, no email notifications | `notifications/routes.ts`                                                | Paging; per-item read                                                                 |
| 8   | No role-management UI                                                      | `pnpm set-role` only (D36)                                               | Admin-only route with an audit entry                                                  |
| 9   | `stance_history` is recorded but never shown                               | No reader of the table                                                   | "Changed my mind" insights (D8)                                                       |
| 10  | Search: 30 results, no paging, limited typo tolerance                      | D39, D72                                                                 | Revisit at ~40% of DB time                                                            |
| 11  | Google sign-in off in production                                           | live `/auth/providers` → `{"google":false}`                              | Configure the OAuth client ([OAUTH_FLOW.md](../07_SECURITY/OAUTH_FLOW.md))            |

## Correctness and security observations

| #   | Observation                                                                                                   | Where                                          | Recommendation                                               |
| --- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| 12  | **Unban has no rank check** (ban does)                                                                        | `moderation/routes.ts:262` vs `:238`           | Mirror the rank rule                                         |
| 13  | **No CSP / frame protection on the website's HTML**                                                           | live headers; `vercel.json`                    | Add headers in `vercel.json`                                 |
| 14  | Deleting a user (outside the app) leaves `helpful_score` and stance counts slightly high                      | cascades don't adjust counters                 | Adjust in the deletion transaction, or run the rebuilds      |
| 15  | The stance summary on the question page doesn't refresh right after you pick a side                           | `useSetStance` updates only `["stance", slug]` | Also invalidate `["question", slug]`                         |
| 16  | Expired sessions, pending sign-ins and email tokens are never cleaned up unless presented                     | no cleanup job                                 | Periodic `DELETE … WHERE expires_at < now()`                 |
| 17  | Rate limits are per IP only                                                                                   | `@fastify/rate-limit` config                   | Per-account throttling for login                             |
| 18  | False stances can game cross-side weights                                                                     | roadmap "Known weakness"                       | Reputation or account-age weighting                          |
| 19  | Post-column indexes still use `id DESC NULLS LAST`, the pattern that cost a sort step on the question indexes | migration `0010`; `schema.ts:285–295`          | Check with `EXPLAIN`; rebuild with `.nullsFirst()` if needed |
| 20  | The email-queue comment says "about 20 minutes"; BullMQ's backoff gives ~10.5 min of waits                    | `mailer.ts:35`                                 | Correct the comment or raise `attempts`                      |

## Operational limitations

| #   | Limitation                                                   | Recommendation                                        |
| --- | ------------------------------------------------------------ | ----------------------------------------------------- |
| 21  | **No backups beyond Neon's 6-hour history**                  | Scheduled `pg_dump` to private storage + restore test |
| 22  | No error monitoring beyond host logs                         | Sentry (scrubbed) or similar                          |
| 23  | Cold starts: first visit after 15 idle minutes takes 30–60 s | Accept (free tier) or upgrade                         |
| 24  | Emails from a personal sender may land in spam               | Custom domain with SPF/DKIM/DMARC in Brevo            |
| 25  | Production rate limits are in memory (single instance)       | Fine for one instance; Redis needed if scaled         |
| 26  | One region (Singapore) for API and DB                        | Fine for a demo                                       |

## Documentation inconsistencies found

| #   | Where                                           | Issue                                                                                                                        |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 27  | `README.md` status line                         | Says "Phases 0–7 complete"; phases 8 and 9 are complete too                                                                  |
| 28  | `docs/DEPLOYMENT.md` step 4                     | The `ENABLE_EXPERIMENTAL_COREPACK` row sits outside its table and renders as plain text                                      |
| 29  | `docs/ROADMAP.md` "Backend module layout"       | Lists `users/` and `comments/` modules; comments live in `challenges/thread.ts`, and `users/` doesn't exist                  |
| 30  | `docs/ROADMAP.md` "Scaled architecture" diagram | Shows sessions in Redis and a search engine; the measured outcome kept sessions in Postgres (D68) and no search engine (D72) |
| 31  | `docs/ROADMAP.md` security checklist            | The last item (HTTPS + backups) is unticked although HTTPS is done; backups are the open part                                |

## Missing historical information

- The exact cause of the early Phase 0 `pnpm install`/`db:migrate` failure.
- The reasoning behind most specific rate-limit numbers (30 stance changes/hour, 120 votes/hour, …); they appear to be judgement calls and aren't recorded.
- Detailed bug histories for Phases 1–5: each phase was committed after it worked, and the session summaries mention only some issues.
- Lab results are on one laptop; no production load numbers exist (production traffic is tiny).
