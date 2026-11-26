# Debugging Lessons and a Practical Toolkit

## Lessons from this project

1. **Measure, don't guess.** Every performance change in Phase 9 started with `pg_stat_statements` or a CPU profile, and ended with a before/after number. The biggest API cost (Drizzle building SQL, 22%) was not what anyone would have guessed.
2. **Reproduce at the right layer.** The logout redirect bug (B4) only appeared in a real browser; the race conditions only in tests that fire concurrent requests; the Render wake-up problem only on the live site.
3. **Read the query plan.** Two index bugs (B6, B7) were invisible in the code and obvious in `EXPLAIN (ANALYZE, BUFFERS)`.
4. **Order of checks matters** (B2), and so does the order of side effects (B4: navigate before clearing state; invalidate the cache after commit).
5. **Unhandled `"error"` events kill Node processes** (B1).
6. **Configuration is code:** validate it at startup and normalise it (B5).
7. **Infrastructure fails quietly:** Compose scaled things back down; `--cpus 0` didn't remove a limit; nginx limits were too low. Verify the lab is what you think it is before trusting its numbers.
8. **Don't hide exit codes:** piping a check's output can swallow its failure. Run checks separately.
9. **Test many viewport sizes with measurements** (F4): screenshots are for humans; numbers catch regressions.

## Toolkit: where to look when something breaks

### "The site doesn't load / shows Loading… forever"

1. Open DevTools → Network. Are `/api/...` requests returning 502? Then Render is asleep or crashed; the app retries for 2 minutes.
2. Open `https://perspective-api.onrender.com/health` directly. `{"status":"ok"}` means the process is up.
3. Open `https://perspective-lilac.vercel.app/api/health/ready`. `ok` means the database is reachable _through the proxy_; 503 means Neon is unreachable; 403 means `ORIGIN_SECRET` doesn't match between Vercel and Render.
4. Render dashboard → Logs (JSON lines from Pino: look at `level`, `msg`, `err`).

### "Every form says Cross-site request blocked"

`WEB_ORIGIN` doesn't match the browser's origin. Locally, use `http://localhost:5173`, not `127.0.0.1` (README). In production, Render's `WEB_ORIGIN` must be exactly the Vercel URL.

### "The API refuses to start"

The output lists invalid variables (`config/env.ts`). Common: missing `DATABASE_URL`; `SMTP_URL` missing with `NODE_ENV=production`; both `TRUST_PROXY` and `ORIGIN_SECRET` set; `ORIGIN_SECRET` shorter than 32 characters.

### "ECONNREFUSED 127.0.0.1:5432"

Postgres isn't running: start Docker Desktop, `docker compose up -d`, `docker compose ps` (wait for "healthy").

### "Password authentication failed for perspective_app"

The passwords in `.env` changed after the volume was created; they're only applied on first creation. `docker compose down -v` (**deletes local data**) and start again.

### A query is slow

```sql
-- top queries by total time (local Docker has pg_stat_statements)
SELECT calls, round(mean_exec_time::numeric, 2) AS avg_ms, left(query, 120)
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;

-- then
EXPLAIN (ANALYZE, BUFFERS) <the query with real values>;
```

Look for `Seq Scan` on big tables, `Sort` above an `Index Scan`, `Rows Removed by Filter` in the thousands.

### A test fails only sometimes

- API tests share one database and run one file at a time (`fileParallelism: false`). Don't run `pnpm test` and `pnpm test:e2e` at the same time: they share `perspective_test`.
- E2E retries once in CI; traces are kept on failure (`trace: "retain-on-failure"`), and CI uploads `playwright-report` as an artifact. Open the report and step through the trace.

### Emails don't arrive

- Development: the email is printed in the API terminal ("email (not sent, no SMTP_URL)").
- Local images: Mailpit at http://localhost:8025.
- Production: Render logs show `email sent` (with a masked recipient) or `verification email failed`; check Brevo's dashboard and the spam folder.

### The client IP looks wrong

```sql
SELECT host(ip) FROM sessions ORDER BY created_at DESC LIMIT 1;
```

It should be your public IP. If it shows a Vercel or private address, the trusted-proxy setup is wrong (`ORIGIN_SECRET` / `TRUST_PROXY`).

### Inspect logs safely

Logs never contain cookies, passwords or tokens (redacted) and show masked emails. If you add new logging, log objects (`log.info({ postId }, "msg")`), never request bodies.
