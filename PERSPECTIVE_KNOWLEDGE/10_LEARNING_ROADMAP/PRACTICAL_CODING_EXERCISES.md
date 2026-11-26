# Practical Coding Exercises

Do these on a branch (`git switch -c practice`), never on `main`. Each exercise lists the files to touch and how to check it. Hints are short on purpose; the matching deep dive has the background. Several exercises are also real improvements from [KNOWN_LIMITATIONS.md](../08_BUGS_AND_DEBUGGING/KNOWN_LIMITATIONS.md) (marked ⭐).

## Warm-ups (Modules 1–3)

1. **Break the config.** Set `PORT=abc` in `.env` and start the API. Read the error. Then set `NODE_ENV=production` with no `SMTP_URL`. Which `refine` fires? _(env.ts)_
2. **Add a health detail.** Make `/health/ready` also report `{ database: "ok", latencyMs: n }`. Keep `/health` DB-free. Update `server.test.ts`.
3. **Trace a request in the logs.** Set `LOG_LEVEL=debug`, log in, and find the request lines. Confirm the cookie is `[Redacted]`.
4. **Fix the comment** in `mailer.ts:35` so it states the real retry window (~10.5 min of waits), or change `attempts` so "about 20 minutes" becomes true. Prove it with the BullMQ formula. ⭐

## Database (Module 2, 5–7)

5. **Read a plan.** Seed (`pnpm seed --users 500 --questions 200`), then run `EXPLAIN (ANALYZE, BUFFERS)` on the Top column query for the busiest question. Identify the index used. Then drop `posts_column_top_idx` in a scratch DB and compare.
6. **Check the NULLS ordering on post indexes.** Using the plan from 5, decide whether migration-0012-style `.nullsFirst()` would help `posts_column_idx` / `posts_column_top_idx`. If yes, write migration 0013. ⭐
7. **Write a cleanup query.** Delete expired `sessions`, `oauth_pending` and `email_tokens` rows. Which indexes make it fast? Where would you run it (startup? a worker)? ⭐
8. **A new sort.** Add `sort=discussed` to `/questions` (most live posts). You'll need a stored `post_count` column maintained transactionally (like D74), a backfill migration, a partial index, a cursor and tests. Compare with counting live.

## Auth and security (Module 4)

9. **Change password.** `POST /auth/password/change { currentPassword, newPassword }`: `requireUser`, verify the current password, hash the new one, delete all _other_ sessions, keep this one. Tests: wrong current password → 401; other sessions gone. ⭐
10. **Log out other devices.** `GET /auth/sessions` (id, created, ip, user agent, "this device") and `DELETE /auth/sessions/:id` (only your own). Add a list to `AccountPage`. ⭐
11. **Per-account login throttling.** Count failed logins per email in the last 15 minutes (a new table, or Redis); after 5, answer 429 for that account. Keep the generic message. ⭐
12. **Explain-then-break CSRF.** In a scratch branch, comment out `checkOrigin` and change the cookie to `sameSite: "none"`. Write a test that a POST without `Origin` now succeeds. Restore everything and explain which single layer would still have stopped a real cross-site form.

## Features (Modules 6–9)

13. **Unban rank rule.** Apply the ban's rank check to unban; add a test where a moderator tries to unban a user banned by an admin. ⭐
14. **Refresh the stance summary.** After `useSetStance` succeeds, also invalidate `["question", slug]` so the split updates immediately. Verify in the browser. ⭐
15. **Edit a comment.** `PATCH /comments/:id` (author only, live, same length rules), with `edited_at`; show "edited" in `Thread.tsx`.
16. **Notification paging.** Keyset paging with `notifications_user_idx`; "Load more" on the page.

## Frontend (Module 10)

17. **CSP header.** Add `Content-Security-Policy-Report-Only` in `vercel.json`, run the production build locally (`pnpm --filter @perspective/web preview`) and check the console for violations. Then plan the enforcing header. ⭐
18. **A profile page.** `/u/:username` listing that user's live posts (new API route with keyset paging).

## Testing and ops (Modules 11–13)

19. **Write an E2E test** for "Continue this thread" from a notification link (`/c/<id>#comment-<id>` scrolls to the comment).
20. **Backup rehearsal.** Run `pg_dump` against your local DB with a read-only role, restore into a new database, and count rows to verify. Write down the steps you'd automate for Neon. ⭐
21. **Reproduce one Phase 9 number.** Run the baseline at `RATE=25` and `RATE=50`; compare your p95 and API CPU with `docs/SCALING.md`. Explain any difference (hardware, noise).
22. **Cache experiment.** With Redis on, call `GET /questions/<slug>` twice logged out and check `x-cache: miss` then `hit`. Vote as another user and call again. Which version key changed?
