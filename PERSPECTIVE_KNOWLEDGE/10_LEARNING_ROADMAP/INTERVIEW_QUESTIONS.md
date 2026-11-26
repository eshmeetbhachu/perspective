# Interview Questions (With Model Answers)

Answer out loud first; then compare. Answers are short on purpose: in an interview, lead with the idea, then give the detail from this project.

## Architecture

**1. Describe the architecture in one minute.**
A React SPA on Vercel calls `/api/*` on its own origin; Vercel proxies to a Fastify API in Docker on Render, adding a shared-secret header; the API uses PostgreSQL 18 on Neon via Drizzle. It's a modular monolith: one deployable, feature folders. Shared Zod schemas keep the frontend and backend rules identical. Scaling features (Redis cache, queue, replica, metrics) exist behind configuration and were measured in a local lab.

**2. Why a monolith?**
One transaction can span features (a challenge, its notification and spam flags commit together); there are no network failures between parts; it's simple to run. Phase 9 measured the bottlenecks (API CPU, then DB reads); they were solved by more identical instances and a read replica, not by splitting code.

**3. Why proxy `/api` through the website's domain?**
The session cookie stays first-party (not blocked as a third-party cookie), there's no CORS preflight, and the same frontend code works everywhere.

## Database

**4. Why UUIDv7?** Unguessable ids (no `/users/1043` enumeration) that are time-ordered, so inserts stay at the end of the B-tree and "newest first" is `ORDER BY id DESC`.

**5. How do you keep counts like `helpful_score` correct?** They're updated with `SET x = x + n` in the same transaction as the vote, so they commit or roll back together, and the arithmetic happens under the row lock. Rebuild functions exist, and a check constraint catches negatives.

**6. Explain keyset pagination and why you chose it.** The cursor holds the last row's sort value and id; the next page is `WHERE (score, id) < ($score, $id) ORDER BY score DESC, id DESC LIMIT n+1`. It's an index range scan at any depth, with no skipped or duplicated rows when new items arrive, unlike `OFFSET`.

**7. Tell me about an index problem you fixed.** The post-column partial index was `WHERE deleted_at IS NULL`, but the query also filtered `removed_at IS NULL`, so Postgres couldn't trust the index's order and sorted the whole column. Matching the condition took the busiest column from 3.0 ms and 1,729 pages to 0.4 ms and 95 pages. A second one: an index on `id DESC NULLS LAST` didn't match `ORDER BY id DESC` (which means NULLS FIRST): 3.4 ms → 0.5 ms after rebuilding.

**8. How do you load a comment thread?** One recursive CTE: the anchor selects the top-level comments, the recursive step joins children, a `path` array sorts the result depth-first, and it stops at 5 levels with a `has_more` flag for "continue this thread".

**9. How did you prevent two simultaneous stance changes from both passing the cooldown?** `SELECT ... FOR UPDATE` inside a transaction locks the row; the second request waits, sees the new timestamp and is refused. First declarations race on the primary key, handled with `ON CONFLICT DO NOTHING`. A test fires two requests at once.

**10. What is least privilege in your database setup?** The app connects as a role with only row permissions; migrations run as a separate role that owns the schema; the server process never has the migrator's password; and the audit log has `UPDATE/DELETE/TRUNCATE` revoked from the app role.

## Security

**11. Sessions or JWTs, and why?** Server-side sessions in an httpOnly cookie: injected JavaScript can't steal them, and they can be revoked instantly (bans, password resets). Roles are read fresh on every request. The cost is one indexed lookup (0.06 ms measured).

**12. How do you prevent CSRF?** SameSite=Lax cookies; every non-GET request must carry `Origin` equal to our site; only JSON bodies are accepted, which forces a CORS preflight for cross-site requests. Three independent layers, no tokens needed.

**13. How do you prevent XSS with user Markdown?** React escapes plain text; Markdown is parsed with marked and sanitised with DOMPurify using a small tag allowlist (no images, no raw HTML, `javascript:` links removed, safe `rel` on links). The cookie is httpOnly anyway. Next step: a CSP header.

**14. How do you store passwords?** argon2id at OWASP's parameters (19 MiB, 2 passes). Unknown emails are checked against a dummy hash so timing doesn't reveal accounts; there's a generic error and rate limiting.

**15. Why not link Google accounts by email?** Pre-account takeover: an attacker registers your email first with their own password; auto-linking would give both of you the account. We match Google's `sub`, and link only after the owner proves control (logged in, or logs in with the password while the Google identity waits server-side).

**16. How do you know the client IP is real behind a proxy?** Vercel adds a secret header and overwrites `X-Forwarded-For`; the API refuses requests without the secret (constant-time compare), so every accepted request came through Vercel and its forwarded IP can be trusted.

## Scaling

**17. What was your first bottleneck and how did you find it?** API CPU at ~600 req/s on 1 CPU: p95 jumped from 18 ms to 6.5 s while the database sat under 10%. A CPU profile showed 22% of the time spent in the ORM building SQL strings.

**18. How does your cache invalidation work?** Scoped version counters in Redis; the cache key includes the current versions; writes bump their scopes _after_ commit, so old keys are never read again and expire. One `INCR` replaces "find and delete keys". Logged-in responses aren't cached.

**19. What is read-your-writes and how did you get it with a replica?** After a write, the primary's WAL position is stored per scope (an atomic Lua max); reads use the replica only if `pg_last_wal_replay_lsn()` has reached that position. Measured: 0 stale reads with the replica held 300 ms behind, vs 100% stale without the check.

**20. What did you put in a queue and what didn't you?** Emails (slow, external, can be retried), with 8 retries and a separate worker. Notifications and score updates stayed in their transactions because they must be atomic with their cause.

**21. Why didn't you add a search engine?** Search was 18–26% of DB time, not the bottleneck; an engine would add a service, a sync pipeline and staleness. The revisit threshold (~40% after caching, or a need for typo tolerance or facets) is written down.

**22. What does tracing cost?** It doubled CPU per request; even 1% sampling added ~43%, because the instrumentation itself costs ~0.7 ms per request. So metrics stay always on, and tracing is opt-in for investigations.

## Process

**23. How do you test?** Unit tests for pure rules, integration tests against a real Postgres through `app.inject` (including concurrency tests), and Playwright for journeys. CI runs everything plus audit and Docker builds; Render deploys only commits that passed.

**24. What would you do next?** Backups with a tested restore, a CSP header, error monitoring, the unban rank fix, session management and account deletion, and possibly reputation-weighted votes against fake stances.
