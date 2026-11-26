# Backend File Guide

Every file in `apps/api`, what it is responsible for, what it depends on, and what depends on it. For the big picture read [BACKEND_ARCHITECTURE.md](../01_ARCHITECTURE/BACKEND_ARCHITECTURE.md) first.

## Entry points

| File                     | Responsibility                                                                                                                     | Depends on                                                                       | Used by                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------ |
| `src/server.ts`          | Build the app, attach `error` listeners to the pg pools and Redis, start metrics, listen, graceful shutdown                        | `app`, `cache`, `config/env`, `db/client`, `telemetry`                           | `pnpm dev:api`, `dist/server.js`           |
| `src/app.ts`             | `buildApp()`: register plugins, hooks and all 12 route modules; never listens                                                      | every plugin and module                                                          | `server.ts`, every API test                |
| `src/migrate.ts`         | Apply pending migrations as the migrator under `pg_advisory_lock(7212001)`                                                         | `drizzle-orm/node-postgres/migrator`, `pg`, `zod` (does **not** import `env.ts`) | Docker `CMD`, `pnpm db:migrate:deployed`   |
| `src/worker.ts`          | Separate process: consume the `email` BullMQ queue and send via `deliverEmail`; graceful shutdown                                  | `bullmq`, `ioredis`, `pino`, `mailer`, `config/*`                                | compose `worker` service (lab/app profile) |
| `src/instrumentation.ts` | If `OTEL_EXPORTER_OTLP_ENDPOINT` is set: register the ESM loader hook, tracer provider and the pg/ioredis/fastify instrumentations | OpenTelemetry packages, `config/env`                                             | `node --import ./dist/instrumentation.js`  |

**Why does `migrate.ts` not import `config/env.ts`?** `env.ts` requires `DATABASE_URL` and everything the server needs; the migration step only needs `MIGRATION_DATABASE_URL`. Keeping it standalone means it validates only what it uses.

## Configuration

| File                   | Responsibility                                                                                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/config/env.ts`    | `EnvSchema` (Zod) for every variable, with defaults and rules; two cross-field `.refine` checks (production needs `SMTP_URL`; not both `TRUST_PROXY` and `ORIGIN_SECRET`); empty strings treated as unset; on failure prints `z.prettifyError` (names only, no values) and exits. Exports `env` and type `Env`. |
| `src/config/logger.ts` | `loggerOptions` for Pino: level, `redact` paths (cookie and authorization headers, `set-cookie`, any `password`/`token` field), a `req` serializer that logs method, redacted URL and IP, and pretty output in development. `redactUrl()` replaces `code`, `state` and `token` query values.                    |

## Database layer

| File               | Responsibility                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `src/db/client.ts` | `pool` (pg), `db` (Drizzle, snake_case), optional `replicaPool`/`replicaDb`, and type `Executor` (db or transaction) |
| `src/db/schema.ts` | All 15 tables, 11 enums, indexes and checks. See [DATABASE_FILE_GUIDE.md](DATABASE_FILE_GUIDE.md)                    |
| `src/db/errors.ts` | `uniqueViolation(err)`: returns the constraint name if `err.cause.code === "23505"`                                  |

## Cross-cutting

| File                           | Responsibility                                                                                                                      | Notes                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/errors.ts`                | `class AppError extends Error { statusCode, code, details }`                                                                        | `code` typed by shared `ErrorCode`, so a typo is a compile error                                                                  |
| `src/plugins/error-handler.ts` | `errorHandler` (4 branches), `notFoundHandler`                                                                                      | The only place response error bodies are built                                                                                    |
| `src/plugins/auth.ts`          | `loadSession` (onRequest), `requireUser`, `requireVerifiedEmail`, `requireRole`; augments `FastifyRequest` with `user`, `sessionId` | `declare module "fastify"` explained in [TYPESCRIPT_IN_PERSPECTIVE.md](../06_TYPESCRIPT_AND_BACKEND/TYPESCRIPT_IN_PERSPECTIVE.md) |
| `src/plugins/csrf.ts`          | `checkOrigin`: non-GET/HEAD/OPTIONS requests need `Origin === WEB_ORIGIN`                                                           |                                                                                                                                   |
| `src/plugins/proxy-secret.ts`  | `requireProxySecret`: constant-time compare of `x-origin-secret`; `/health*` exempt                                                 | No-op unless `ORIGIN_SECRET` is set                                                                                               |
| `src/cache.ts`                 | `redis`, `bumpCache`, `serveFromCache`, `storeInCache`, `readerFor`, `neededPosition`, cache configs                                | Everything is a no-op without `REDIS_URL`                                                                                         |
| `src/mailer.ts`                | `sendEmail` (queue or direct), `deliverEmail` (SMTP or log), `maskEmail`, `emailQueue`                                              | Tests never send real email (`NODE_ENV === "test"`)                                                                               |
| `src/telemetry.ts`             | Prometheus registry, request-duration histogram, cache counters, `recordRequests`, `startMetricsServer`                             |                                                                                                                                   |

## Modules

### `modules/auth/`

| File               | Responsibility                                                                                                    | Key exports                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `tokens.ts`        | Random tokens and their SHA-256 hashes                                                                            | `newToken`, `hashToken`                                                                                |
| `passwords.ts`     | argon2id hash/verify; a precomputed dummy hash for equal-time failures                                            | `hashPassword`, `verifyPassword`, `verifyAgainstDummy`                                                 |
| `sessions.ts`      | Session create/validate/renew/delete; cookie options; public user mapping                                         | `startSession`, `validateSession`, `cookieOptions`, `authUserColumns`, `toPublicUser`, type `AuthUser` |
| `users.ts`         | Insert a user, translating unique violations into `EMAIL_TAKEN`/`USERNAME_TAKEN`                                  | `insertUser`                                                                                           |
| `routes.ts`        | `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`                                                       | `authRoutes`                                                                                           |
| `email-tokens.ts`  | Issue (replacing older) and consume (single-use) email tokens; compose the two emails                             | `consumeToken`, `sendVerificationEmail`, `sendPasswordResetEmail`                                      |
| `email-routes.ts`  | `/auth/email/verify/send`, `/auth/email/verify`, `/auth/password/forgot`, `/auth/password/reset`                  | `emailRoutes`                                                                                          |
| `google.ts`        | openid-client discovery (cached promise), authorization URL with state/PKCE/nonce, code exchange                  | `isGoogleConfigured`, `createGoogleAuthorization`, `exchangeGoogleCode`                                |
| `oauth.ts`         | Pending Google sign-ins (create/find/delete), linking, link-after-password-login                                  | `createPending`, `findPending`, `linkGoogle`, `linkPendingGoogle`                                      |
| `google-routes.ts` | `/auth/providers`, `/auth/google/start`, `/auth/google/callback`, `/auth/google/pending`, `/auth/google/complete` | `googleRoutes`                                                                                         |

### `modules/questions/`

| File        | Responsibility                                                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes.ts` | Ask (daily limit, unique slug retries), list (new/active/divided keyset cursors), search (`websearch_to_tsquery` + `ts_rank`), similar (`%` trigram), get by slug |
| `find.ts`   | `findPublishedQuestionId(slug, reader?)`: used by stances and posts                                                                                               |
| `slugs.ts`  | `slugify(title)`: Unicode-aware, Latin accents dropped, 80-char word-boundary cut                                                                                 |

### `modules/stances/`

| File        | Responsibility                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| `routes.ts` | `GET`/`PUT /questions/:slug/stance`; `findStance(userId, questionId)` exported for posts and votes       |
| `counts.ts` | `moveStanceCount(tx, questionId, from, to)` (+1/-1 inside the transaction); `recountStances()` for seeds |

### `modules/posts/`

| File         | Responsibility                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `routes.ts`  | Column listing; create (stance snapshot, daily limit, spam checks, one-per-side); get; edit; soft delete                             |
| `queries.ts` | `postColumns`, `selectPosts(viewerId, rank, reader)` (joins the viewer's vote), `live` filter, `findPost`, `toPost`                  |
| `ranking.ts` | `rankPosts(sort, cursor)`: ORDER BY, keyset condition and cursor encoding for top/hot/new; base64url JSON cursors validated with Zod |

### `modules/votes/`

| File         | Responsibility                                                                           |
| ------------ | ---------------------------------------------------------------------------------------- |
| `weights.ts` | `voteWeight(voter, post)` → 1/2/3; `isCrossSide`                                         |
| `routes.ts`  | `PUT`/`DELETE /posts/:id/vote`: checks, then vote + score in one transaction             |
| `scores.ts`  | `recomputeScores()`: SQL `CASE` mirroring `voteWeight`, then rebuild every post's counts |

### `modules/challenges/`

| File        | Responsibility                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes.ts` | Create a challenge (in-transaction spam checks + notification), list a post's challenges, challenge page payload; `findChallenge`                  |
| `thread.ts` | `loadThread` (recursive CTE, 5 levels per page, 1,000-row cap), list/post comments (depth rules, daily limit, notification), soft-delete a comment |

### `modules/notifications/`

| File        | Responsibility                                                               |
| ----------- | ---------------------------------------------------------------------------- |
| `notify.ts` | `notify(tx, values)`: insert unless the recipient is missing or is the actor |
| `routes.ts` | Unread count (polled), latest 30, mark all read                              |

### `modules/moderation/`

| File         | Responsibility                                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `routes.ts`  | Report; then an encapsulated scope with `requireRole("moderator")`: queue, remove, restore, dismiss, ban, unban, audit                    |
| `targets.ts` | `findTarget(type, id)`: one shape for any reportable item (title, excerpt, link, removed, visible); `setRemoved(tx, type, id, bool)`      |
| `spam.ts`    | `rejectDuplicate` (refuse the same text within a day) and `flagIfSuspicious` (link-heavy new accounts, comment bursts → automated report) |

### `modules/health/`

| File        | Responsibility                                                                          |
| ----------- | --------------------------------------------------------------------------------------- |
| `routes.ts` | `/health` (liveness, no DB) and `/health/ready` (runs `select 1`) at `logLevel: "warn"` |

## Scripts (`apps/api/scripts/`)

| Script                | Command                                       | What it does                                                                                                                                                         |
| --------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build.ts`            | `pnpm --filter @perspective/api build`        | esbuild: bundle 4 entry points, keep npm deps external, source maps                                                                                                  |
| `seed.ts`             | `pnpm seed [--users N --questions N --clear]` | Realistic users/questions/stances/posts/votes/challenges/comments; backdated UUIDv7s; refuses `NODE_ENV=production`; `--clear` deletes only `@seed.example` accounts |
| `setup-roles.ts`      | `pnpm db:setup-roles`                         | One transaction on a hosted DB: create roles with random passwords, grants, default privileges; prints the two URLs once                                             |
| `set-role.ts`         | `pnpm set-role <email> <role>`                | Validate arguments with Zod, update `users.role`                                                                                                                     |
| `recompute-scores.ts` | `pnpm recompute-scores`                       | Call `recomputeScores()`                                                                                                                                             |
| `load-fixtures.ts`    | `pnpm load:fixtures`                          | Write `load/data/fixtures.json`: slugs, post and challenge ids, 2,000 sessions (lab)                                                                                 |
| `with-load-db.ts`     | used by `load:*` scripts                      | Rewrite both DB URLs to `/perspective_load` and run the given command                                                                                                |

## Tests (`apps/api/test/`)

| File              | Covers                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `env.ts`          | Points `DATABASE_URL`/`MIGRATION_DATABASE_URL` at `/perspective_test`, Redis at db 1, silent logs |
| `global-setup.ts` | Runs migrations on the test DB once before all files                                              |
| `setup.ts`        | Per-file setup: test env; close the pool and Redis afterwards                                     |
| `helpers.ts`      | `resetDatabase`, `post`/`get` with `Origin` and cookies, `register`, cookie helpers               |
| `*.test.ts` (15)  | See [UNIT_AND_INTEGRATION_TESTS.md](../09_TESTING_AND_DEPLOYMENT/UNIT_AND_INTEGRATION_TESTS.md)   |
