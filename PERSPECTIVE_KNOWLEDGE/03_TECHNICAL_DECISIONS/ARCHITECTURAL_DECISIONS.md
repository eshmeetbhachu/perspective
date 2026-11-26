# Architectural Decisions

Each decision uses the same template. "D" numbers point at the Decision Log in `docs/ROADMAP.md`, which records the original one-line reasoning. This page expands it.

---

## A1. Modular monolith, not microservices (D13)

- **Problem:** how to structure the backend so it's simple now but can grow.
- **Chosen:** one Fastify process; features in `src/modules/<feature>/`, each owning its routes, rules and queries.
- **Why:** one deployable unit, one database transaction can span features (e.g. a challenge + its notification + a spam report commit together), no network calls between parts, and trivial local development.
- **How it works:** `app.ts` registers every module's routes on the same app. Modules call each other's exported helpers directly (`findPost`, `findStance`, `notify`).
- **Advantages:** atomic transactions across features; fast in-process calls; one log stream; easy refactoring.
- **Disadvantages:** all features scale together; one bad deploy affects everything; module boundaries are a convention, not enforced.
- **Alternatives:** microservices (auth service, content service…); serverless functions per route.
- **What could go wrong with them:** the notification would live in another service, so "challenge saved but notification lost" becomes possible, which needs a queue or an outbox pattern. Every request pays network latency; local setup needs many processes; serverless cold starts on a free tier would stack on top of Render's.
- **Still appropriate?** Yes. Phase 9 measured that the bottlenecks were API CPU (solved by running more identical copies) and database reads (solved by a replica). Nothing pointed at splitting code.

---

## A2. Monorepo with a shared package consumed as TypeScript source (D17)

- **Problem:** the website and the API must agree on validation rules (username format, title length) and on response shapes.
- **Chosen:** pnpm workspaces; `packages/shared` exports Zod schemas and types; its `package.json` points straight at `./src/index.ts`, with no build step.
- **Why:** change a rule once and both sides get it instantly; no stale `dist/` folder to rebuild; less configuration (no TypeScript project references).
- **How it works:** Vite and tsx compile TypeScript on the fly, so they can import `.ts` from the shared package. `moduleResolution: "bundler"` in `tsconfig.base.json` allows the `.ts` export.
- **Advantages:** one source of truth; type errors appear across the boundary immediately (change a response type and every page using it fails `pnpm typecheck`).
- **Disadvantages:** Node can't run `.ts` imports in production, so the API **must be bundled** (esbuild), which also became a benefit (D56).
- **Alternatives:** publish `shared` as a built package; copy types by hand; generate an OpenAPI spec and client.
- **What could go wrong with them:** a built package needs a watch process and goes stale; hand-copied types drift silently; OpenAPI generation adds tooling and still needs runtime validation.
- **Still appropriate?** Yes.

---

## A3. One origin: the website proxies `/api` to the API (D33, D56)

- **Problem:** the browser must send the session cookie to the API, and modern browsers increasingly block third-party cookies.
- **Chosen:** the page and the API always appear under the same origin. Vite (dev), nginx (local images) and Vercel (production) forward `/api/*`.
- **Why:** the cookie is first-party; no CORS preflights; identical frontend code everywhere.
- **Advantages:** simpler, faster, more private.
- **Disadvantages:** every API request passes through the proxy (an extra hop); proxy timeouts matter (Netlify's 26 s limit ruled it out, D63).
- **Alternatives:** API on its own domain with CORS + `SameSite=None` cookies; tokens in headers.
- **What could go wrong with them:** third-party cookie blocking would break logins; `SameSite=None` weakens CSRF protection; tokens readable by JavaScript can be stolen by XSS.
- **Still appropriate?** Yes. With a custom domain, `api.example.com` + `example.com` would also be same-_site_, which is another option.

---

## A4. Validate everything with Zod, at every boundary (D20)

- **Problem:** never trust input: environment variables, request bodies, query strings, cursors, cookies containing JSON.
- **Chosen:** Zod schemas for env (`env.ts`), routes (`schema: { body, params, querystring, response }`), cursors (`ranking.ts`), the Google state cookie (`google-routes.ts:27`), and forms in the browser.
- **Why:** readable schemas that double as TypeScript types (`z.infer`), shared with the frontend, with clear error messages.
- **Disadvantages:** slightly slower than Fastify's native JSON-schema validator. Phase 9 profiling measured Zod at ~2% of API CPU, which is negligible.
- **Alternatives:** TypeBox / JSON Schema (Fastify-native, faster); class-validator; hand-written checks.
- **Still appropriate?** Yes; the measurement settled the performance concern.

---

## A5. A custom error contract (D22)

- **Problem:** the frontend needs to react to specific failures (e.g. show "already posted on this side") without parsing human text.
- **Chosen:** `{ error: { code, message, details? } }` with `code` from a typed union in `packages/shared/src/errors.ts`.
- **Why:** `code` is a stable contract; messages can be reworded freely; `details` maps to form fields.
- **Alternatives:** RFC 9457 Problem Details (`type`, `title`, `status`, `detail`); bare HTTP status codes.
- **Trade-off:** less standard than RFC 9457, but simpler for a single client, and easy to translate later if the API becomes public.
- **Still appropriate?** Yes.

---

## A6. Keyset (cursor) pagination everywhere (D14, D38, D46, D74)

- **Problem:** long lists (questions, columns) need paging that stays fast and correct while new items arrive.
- **Chosen:** the client passes back the last item's sort value and id; the next page is "strictly after that pair" in index order.
- **Why:** `OFFSET 10000` makes Postgres read and discard 10,000 rows; a keyset condition jumps straight to the position via the index. With offsets, a new item arriving between page 1 and page 2 shifts everything, so items are duplicated or skipped.
- **Disadvantages:** no "jump to page 7"; cursors must encode the sort (base64url JSON for posts, `rank:id` for questions); a cursor from one sort is meaningless in another (the API rejects it).
- **Still appropriate?** Yes: it's the standard approach for feeds.

---

## A7. Store derived counters, updated in the same transaction (Phase 4, D74)

- **Problem:** listings show scores and stance splits; computing them from raw rows per request means counting millions of rows.
- **Chosen:** `posts.helpful_score/helpful_count/cross_side_count` and `questions.for_count/neutral_count/against_count` are updated **inside** the vote and stance transactions.
- **Why:** reads become index scans; the transaction guarantees the counters equal what the rows say.
- **Disadvantages:** every write does slightly more work; a bug in the delta logic would make counts drift. Mitigated by tests, by a check constraint (counts ≥ 0) and by rebuild functions (`recomputeScores`, `recountStances`).
- **Alternatives:** count on read; a materialised view refreshed periodically; a background job.
- **What could go wrong with them:** counting on read is too slow at scale; materialised views and jobs are stale between refreshes.
- **Still appropriate?** Yes.

---

## A8. Soft delete for authors, separate "removed" state for moderators (D15, D50)

- **Problem:** deleted posts are referenced by challenges, comments, votes and reports; moderators need to undo mistakes.
- **Chosen:** `deleted_at` (author) and `removed_at` / `status = 'removed'` (moderator); rows are never physically deleted by the app.
- **Why:** challenges stay readable when the post is deleted; replies keep their place under a deleted comment; a removal can be restored; an author can't post a second copy on the same side after a removal (the unique index only ignores `deleted_at`, not `removed_at`).
- **Disadvantages:** every query must filter (`live`), and indexes must match the filter (D66); data accumulates.
- **Still appropriate?** Yes.

---

## A9. Migrations run on container start, under an advisory lock (D57)

- **Problem:** Render's free plan has no separate "release" step; several instances could start at once.
- **Chosen:** the container runs `dist/migrate.js` first; it takes `pg_advisory_lock(7212001)`, migrates, and releases the lock on disconnect. Then the server starts without the migrator URL.
- **Alternatives:** a CI step that migrates before deploy; manual migrations.
- **Trade-off:** a failed migration stops the container from starting (good: no half-migrated server serves traffic), and slow migrations delay startup.
- **Still appropriate?** Yes for this scale. Large tables would need `CREATE INDEX CONCURRENTLY` outside a transaction (noted in D66).

---

## A10. Everything optional in Phase 9 is off unless configured

- **Problem:** add Redis, a queue, a replica and tracing for learning, without changing or endangering production.
- **Chosen:** every Phase 9 feature checks its environment variable (`REDIS_URL`, `DATABASE_REPLICA_URL`, `METRICS_PORT`, `OTEL_EXPORTER_OTLP_ENDPOINT`) and becomes a no-op without it. Fallbacks are explicit (no queue → send now; no Redis → in-memory rate limits).
- **Why:** production stays $0 and unchanged; the same image runs in the lab with everything on.
- **Still appropriate?** Yes. This is also how real teams roll out infrastructure: behind configuration, measured, reversible.

The full list of every decision with its alternatives is in [ALTERNATIVES_AND_TRADEOFFS.md](ALTERNATIVES_AND_TRADEOFFS.md).
