# Bugs and Fixes

Every bug recoverable from the git history, the Decision Log, `docs/SCALING.md` and the earlier session summaries. Most bugs were fixed before their phase was committed, so the commit history alone doesn't show them. **Source** says where each one is recorded.

---

## Application bugs

### B1. An idle database connection error could crash the API

- **Symptom:** the API process could exit when Postgres dropped an idle connection (a restart, a network blip, Neon suspending).
- **Root cause:** `pg.Pool` emits an `"error"` event for errors on _idle_ clients. In Node, an `"error"` event with no listener is thrown, which crashes the process.
- **Fix:** `pool.on("error", …)` (and the same for the replica pool and Redis) in `apps/api/src/server.ts:16`. The pool replaces the broken connection on the next query.
- **Lesson:** every `EventEmitter` that can emit `"error"` needs a listener. This matters even more on hosts like Neon that suspend idle databases.
- **Source:** session summary (Phase 7 era); comment in `server.ts`.

### B2. "Already posted on this side" was hidden behind "duplicate content"

- **Symptom:** posting a second post with the same text on the same side returned `DUPLICATE_CONTENT` instead of the more useful `ALREADY_POSTED` ("Edit it instead").
- **Root cause:** the spam duplicate check ran **before** the insert, so it fired first.
- **Fix:** run `rejectDuplicate` **after** the insert, inside the same transaction, excluding the new row's own id and ignoring text the author deleted (`spam.ts:48`). The unique-index violation now happens first; a duplicate still rolls back the insert.
- **Lesson:** when several checks can fail, order them from most specific to least. Database constraints are often the most specific.
- **Source:** session summary; D51 ("checking after the insert lets more specific errors like 'already posted on this side' win").

### B3. Report reasons came back as a string, not an array

- **Symptom:** the moderation queue's `reasons` arrived as `"{spam,hate}"` and failed response validation.
- **Root cause:** `array_agg` over a **custom enum** type returns an array type the `pg` driver doesn't know how to parse, so it passes the raw text through.
- **Fix:** cast to `::text[]` (`moderation/routes.ts:123`).
- **Lesson:** the driver parses built-in types; custom types (enums, arrays of them) may need casts.
- **Source:** session summary (Phase 6).

### B4. Logging out on a members-only page sent you to the login page

- **Symptom:** clicking "Log out" on `/account` landed on `/login?next=/account` instead of the home page. Caught by the E2E auth test after the November redesign.
- **Root cause:** `logout.mutate()` set the cached user to `null`; `RequireAuth` re-rendered first and redirected to login before the header's navigation ran.
- **Fix:** navigate to `/` **before** calling `logout.mutate()` (`SiteHeader.tsx:120`).
- **Lesson:** in React, state changes trigger re-renders immediately; order side effects so guards don't react to an intermediate state. E2E tests catch this class of bug; unit tests don't.
- **Source:** session summary (redesign); code comment.

### B5. A trailing slash in `WEB_ORIGIN` would break every form

- **Symptom (prevented):** with `WEB_ORIGIN=https://site.app/`, every POST would fail the Origin check (`https://site.app` ≠ `https://site.app/`).
- **Fix:** the env schema normalises with `new URL(url).origin` (`env.ts:22`); test `server.test.ts:196`.
- **Lesson:** compare origins, not free-form URLs. Normalise configuration at load time.
- **Source:** D61.

### B6. Post-column queries read and sorted whole columns (performance)

- **Symptom:** the busiest column took 3.0 ms and read 1,729 pages to return 11 posts.
- **Root cause:** the partial index condition (`deleted_at IS NULL`) didn't match the query's filter (`… AND removed_at IS NULL`), so Postgres couldn't use the index's order.
- **Fix:** migration `0010`: index conditions identical to the filter. Result: 0.4 ms, 95 pages.
- **Source:** D66, `docs/SCALING.md` §2.

### B7. "Most active / divided" lists needed an extra sort step (performance)

- **Symptom:** 3.4 ms per page on 50,000 questions, with an _Incremental Sort_ in the plan.
- **Root cause:** the index used `id DESC NULLS LAST` (Drizzle's default), but `ORDER BY id DESC` means `NULLS FIRST`, so the orders didn't match.
- **Fix:** migration `0012`, `.nullsFirst()` in the schema → 0.5 ms, pure index scan.
- **Source:** D74; session summary.

### B8. A stance-change race could bypass the cooldown (designed out)

- **Risk:** two simultaneous changes both passing the 24-hour check.
- **Fix:** `SELECT … FOR UPDATE` in a transaction; `ON CONFLICT DO NOTHING` for the first declaration; test fires two at once.
- **Source:** D43; `posts.test.ts:118`.

---

## Frontend and layout bugs

### F1. Hero buttons ignored their sizes

- **Root cause:** a later, general `.button { font: inherit }` rule overrode `.hero-button` sizes (same specificity, later wins).
- **Fix:** select with two classes, `.hero .hero-button` (higher specificity), with a comment explaining why.
- **Source:** session summary (October redesign).

### F2. The front-page artwork was cut off on the owner's screen (~1998×985)

- **Root cause:** the hero kept the artwork's aspect ratio (~1100 px tall), taller than the window.
- **Fix:** hero height `clamp(50vw, 100svh, 55.5vw)`, with the artwork and copy anchored to the bottom in `vw` units, so only the empty sky is trimmed. Commit `d465cd9`. Known limit at the time: on 21:9 ultrawide screens the figure's feet fell below the fold.
- **Source:** session summary.

### F3. Hero buttons collided with the heading on tablets

- **Root cause:** a `min-height` on the buttons made them grow upwards into the heading.
- **Fix:** group the heading and buttons in one `.hero-copy` block anchored at the bottom, so the whole block moves up together.
- **Source:** session summary.

### F4. The hero heading overlapped the header on short laptop windows (the last commit)

- **Symptom:** on the owner's laptop (~1310×655 CSS px, a high-DPI screen scaled by Windows), the heading ran into the navigation.
- **Measurement before:** 7 of 12 window sizes overlapped (gap −24 to +9 px).
- **Root cause:** the redesign added a lead sentence, making the copy block ~21.5vw tall while it sat 24.5vw above the hero's bottom. On wide-but-short windows the hero is only 50vw tall, leaving too little room below the header.
- **Fix (`cdd117f`):** the hero becomes a size container; the copy uses `--u: min(1vw, calc((100cqh - 24.5vw - 104px) / 23))`. Below 1100 px wide the layout stacks (text above the art). After: all 12 sizes ≥31 px gap, verified locally and on the live site.
- **Lesson:** test layouts at many real window sizes with **measurements**, not just screenshots; laptops with display scaling have surprisingly short viewports.
- **Source:** this session.

### F5. The phone question page was ~15,700 px tall

- **Fix:** column tabs on phones (≤760 px) → ~6,200 px (D75).

### F6. The login tagline overlapped the illustration

- **Fix:** tagline moved under the logo; the art panel uses a gap instead of `space-between`.
- **Source:** session summary (redesign).

---

## Deployment and infrastructure issues

### D1. Fastify ignored a numeric `trustProxy` hop count

- **Symptom:** rate limits and session IPs saw the proxy's address.
- **Root cause:** current Fastify no longer honours a hop count, and a hop count can't verify the proxy anyway.
- **Fix:** `TRUST_PROXY` as a list of addresses/ranges (e.g. `uniquelocal`); in production, `ORIGIN_SECRET` + `trustProxy: true` (D58, D61).

### D2. Render doesn't wake for requests that come through a proxy

- **Symptom:** after 15 idle minutes, every request via Vercel got an instant 502, indefinitely.
- **Diagnosis:** measured on the live site: proxied requests got a 502 and the service stayed asleep; a direct request started it (~42 s).
- **Fix:** the browser pings `/health` directly (`no-cors`) on load, and `api()` retries 502 for 2 minutes (D64).

### D3. Docker Compose silently scaled the API back to one instance (lab)

- **Root cause:** recreating `lb-load` also recreated its dependency `api-load` with the default scale.
- **Fix:** `--no-deps` when recreating the load balancer. **Source:** `docs/SCALING.md` §5.

### D4. nginx ran out of connections before the API did (lab)

- **Root cause:** one worker, 8,192 connections; thousands of simulated visitors each hold several.
- **Fix:** `worker_processes auto`, `worker_connections 50000`, `worker_rlimit_nofile 200000`, upstream keepalive (`load/nginx.conf`). **Lesson:** the load balancer can be the bottleneck.

### D5. `docker update --cpus 0` didn't remove a CPU limit (lab)

- **Fix:** recreate the containers. Some tracing measurements ran with the databases still capped, and SCALING.md says so.

### D6. BullMQ warned about Redis's eviction policy (lab)

- **Root cause:** the shared Redis uses `volatile-lru`; BullMQ wants `noeviction`, because evicted lock keys could cause an email to be sent twice.
- **Resolution:** documented as a known lab shortcut; production would give the queue its own non-evicting Redis (D70).

### D7. Database spans were missing from traces (lab)

- **Root cause:** Drizzle's built-in tracing is a stub that produced no useful spans, and the pg/ioredis libraries must be patched **before** they're imported.
- **Fix:** OpenTelemetry instrumentations for `pg`, `ioredis` and Fastify, loaded with `node --import ./dist/instrumentation.js` (D73).

### D8. The first hosting plan was impossible

- Koyeb closed its free plan to new accounts → Render. Netlify's 26 s proxy timeout couldn't survive Render's ~1 min wake → Vercel. Render blocks SMTP ports 25/465/587 → Brevo on 2525 (D63). See [DEVELOPMENT_ISSUES.md](DEVELOPMENT_ISSUES.md).

### D9. Security advisories in dependencies

- `94b0680` updated zod, undici and fast-uri for advisories. `pnpm-workspace.yaml` overrides force patched versions of an `esbuild` pinned by drizzle-kit's config loader and a `zod` pinned by eslint-plugin-react-hooks. A moderate `minimatch` advisory via `@fastify/otel` was accepted (the fix needs much newer OpenTelemetry; lab only; CI fails only on high).

---

## Tooling issues

| Issue                                                                               | Fix                                                                     | Source                                                        |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| `ECONNREFUSED 127.0.0.1:5432` when starting the API                                 | Docker Desktop wasn't running: start it, `docker compose up -d`         | session summary (the owner asked "why did I get this error?") |
| TanStack Query 5.104.1 refused by pnpm's release-age policy                         | pin 5.104.0, rebuild the lockfile (`69ac451`)                           | git                                                           |
| ESLint linted Playwright's generated report files                                   | add `e2e/test-results/` and `e2e/playwright-report/` to `globalIgnores` | session summary                                               |
| Playwright strict mode: `getByRole("button", { name: "Ban" })` also matched "Unban" | `exact: true`                                                           | session summary                                               |
| A format-check failure was hidden because the command's output was piped            | run each check separately so exit codes aren't swallowed                | session summary                                               |
| A script that edited files corrupted `\s` and `̀` regex escapes                      | write the backslash explicitly (`chr(92)`) in the editing script        | session summary                                               |
| E2E after login landed on `/account`, not `/`                                       | screenshot script adjusted                                              | session summary                                               |
| An early `pnpm install` / `db:migrate` failure in Phase 0                           | resolved ("done, worked"); the exact cause **wasn't recorded**          | session summary                                               |
