# Module-by-Module Study Guide

For each module: the files to read in order, the key questions to be able to answer, and the knowledge-base pages that explain it.

---

## Module 1: Setup ✅ (lessons 1–4 done in the tour)

**Read:** `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` and each package's `tsconfig.json`, `eslint.config.js`, `.prettierrc.json` / `.prettierignore`, `.gitignore`, `.env.example`, `.nvmrc`.
**Tour lessons covered:** 1 the big picture and folders; 2 TypeScript settings; 3 lint and formatting; 4 secrets, `.env`, Git.
**Be able to answer:** Why does `packages/shared` exist? What does `noUncheckedIndexedAccess` force you to write? Why is TypeScript pinned to 6.0? Why is `.env` gitignored but `.env.example` committed?
**KB:** [COMPLETE_FOLDER_STRUCTURE](../02_CODEBASE/COMPLETE_FOLDER_STRUCTURE.md), [TYPESCRIPT_IN_PERSPECTIVE](../06_TYPESCRIPT_AND_BACKEND/TYPESCRIPT_IN_PERSPECTIVE.md), [ENVIRONMENT_SECRETS](../07_SECURITY/ENVIRONMENT_SECRETS.md).

## Module 2: Database 🟡 (lessons 1–2 done)

**Read:** `docker-compose.yml` (postgres service), `docker/postgres/init/01-roles.sh`, `apps/api/drizzle.config.ts`, `apps/api/src/db/schema.ts` (users and sessions first, then the rest), `apps/api/migrations/0000`–`0012`.
**Be able to answer:** Why two roles? What does `ALTER DEFAULT PRIVILEGES` do? Why UUIDv7? How does `lower(email)` uniqueness work? What's the difference between `CASCADE` and `SET NULL` here? How does a migration get from `schema.ts` to the database?
**KB:** [DATABASE_FUNDAMENTALS](../05_DATABASE/DATABASE_FUNDAMENTALS.md), [SCHEMA_EXPLANATION](../05_DATABASE/SCHEMA_EXPLANATION.md), [MIGRATIONS_EXPLAINED](../05_DATABASE/MIGRATIONS_EXPLAINED.md), [DATABASE_ARCHITECTURE](../01_ARCHITECTURE/DATABASE_ARCHITECTURE.md).

## Module 3: API skeleton (next)

**Read:** `src/config/env.ts` → `src/db/client.ts` → `src/errors.ts` → `src/plugins/error-handler.ts` → `src/config/logger.ts` → `src/app.ts` → `src/server.ts` → `src/modules/health/routes.ts` → `test/server.test.ts`.
**Be able to answer:** What happens if `DATABASE_URL` is missing? Why does `buildApp` not listen? What are the four branches of the error handler, and why hide 500 details? Liveness vs readiness? Why the `pool.on("error")` listener? What does graceful shutdown do?
**KB:** [BACKEND_ARCHITECTURE](../01_ARCHITECTURE/BACKEND_ARCHITECTURE.md), [FASTIFY_EXPLAINED](../06_TYPESCRIPT_AND_BACKEND/FASTIFY_EXPLAINED.md), [VALIDATION_AND_ERROR_HANDLING](../06_TYPESCRIPT_AND_BACKEND/VALIDATION_AND_ERROR_HANDLING.md).

## Module 4: Authentication

**Read:** `modules/auth/tokens.ts` → `passwords.ts` → `sessions.ts` → `plugins/auth.ts` → `plugins/csrf.ts` → `modules/auth/users.ts` → `routes.ts` → `email-tokens.ts` → `email-routes.ts` → `google.ts` → `oauth.ts` → `google-routes.ts` → `plugins/proxy-secret.ts`; shared `users.ts`; web `auth.ts`, `LoginPage.tsx`, `RequireAuth.tsx`. Tests: `auth`, `email`, `google`, `guards`.
**Be able to answer:** Why hash session tokens with SHA-256 but passwords with argon2id? What do httpOnly, Secure and SameSite=Lax each prevent? How is CSRF stopped without tokens? Why the dummy hash? Why must a reset link be POSTed from a page? What is pre-account takeover and how does the pending flow stop it? Why are roles read on every request?
**KB:** [AUTHENTICATION_ARCHITECTURE](../01_ARCHITECTURE/AUTHENTICATION_ARCHITECTURE.md), the four auth deep dives, all of [07_SECURITY](../07_SECURITY/SECURITY_OVERVIEW.md).

## Module 5: Questions

**Read:** shared `questions.ts` → `modules/questions/slugs.ts` → `find.ts` → `routes.ts`; `stances/counts.ts` (counts); web `questions.ts`, `AskPage.tsx`, `QuestionsPage.tsx`, `QuestionCard.tsx`, `StanceBar.tsx`. Tests: `questions`, `question-counts`.
**Be able to answer:** How are slug collisions resolved safely? How does keyset paging work for "Most divided"? Why must the query's expression match the index's? What does `websearch_to_tsquery` give you? Why trigrams for suggestions?
**KB:** [QUESTIONS](../04_FEATURE_DEEP_DIVES/QUESTIONS.md), [SEARCH_AND_SUGGESTIONS](../04_FEATURE_DEEP_DIVES/SEARCH_AND_SUGGESTIONS.md).

## Module 6: Stances and posts

**Read:** `modules/stances/routes.ts`, `counts.ts`; `modules/posts/queries.ts`, `routes.ts`; `moderation/spam.ts` (the two checks used when posting); web `StancePicker.tsx`, `posts.ts`, `PostColumn.tsx`, `PostCard.tsx`, `PostEditor.tsx`, `markdown.ts`. Tests: `posts`.
**Be able to answer:** Walk through the stance transaction line by line. What does `FOR UPDATE` prevent? Why does a post keep its column when the author changes sides? How is "one post per side" enforced? Why check duplicates after the insert?
**KB:** [STANCES](../04_FEATURE_DEEP_DIVES/STANCES.md), [POSTS](../04_FEATURE_DEEP_DIVES/POSTS.md), [SQL_CONCEPTS_USED](../05_DATABASE/SQL_CONCEPTS_USED.md).

## Module 7: Votes and ranking

**Read:** `votes/weights.ts` → `votes/routes.ts` → `votes/scores.ts` → `posts/ranking.ts`; web `HelpfulButton.tsx`, `useVote`. Tests: `votes`.
**Be able to answer:** Weights and why. Why is a repeated vote harmless? Why can't simultaneous votes lose counts? Why freeze `asOf` in the Hot cursor? Why can't Hot be indexed? Why patch the cache instead of refetching after a vote?
**KB:** [VOTES_AND_RANKING](../04_FEATURE_DEEP_DIVES/VOTES_AND_RANKING.md).

## Module 8: Challenges (+ notifications)

**Read:** `challenges/routes.ts`, `thread.ts`, `notifications/notify.ts`, `notifications/routes.ts`; web `challenges.ts`, `ChallengePage.tsx`, `Thread.tsx`, `NotificationsPage.tsx`. Tests: `challenges`.
**Be able to answer:** Read the recursive CTE aloud. Why `order by path`? Why 5 levels per page and a hard limit of 50? How does `buildTree` work? Why are notifications written inside the transaction?
**KB:** [CHALLENGES_AND_THREADS](../04_FEATURE_DEEP_DIVES/CHALLENGES_AND_THREADS.md), [NOTIFICATIONS](../04_FEATURE_DEEP_DIVES/NOTIFICATIONS.md).

## Module 9: Moderation

**Read:** shared `moderation.ts`; `moderation/targets.ts`, `spam.ts`, `routes.ts`; migration `0009`; web `ReportButton.tsx`, `ModerationPage.tsx`. Tests: `moderation`.
**Be able to answer:** Why is removal separate from deletion? How is the audit log made append-only, and how is that tested? Why does the moderation scope protect new routes automatically? What gap exists in unban?
**KB:** [MODERATION](../04_FEATURE_DEEP_DIVES/MODERATION.md), [ROLES_AND_GUARDS](../04_FEATURE_DEEP_DIVES/ROLES_AND_GUARDS.md).

## Module 10: The website

**Read:** `main.tsx` → `App.tsx` → `api.ts` → `auth.ts` → `forms.ts` → `components/SiteHeader.tsx` → `pages/HomePage.tsx` → `pages/QuestionPage.tsx` → `styles.css` (tokens at the top, then the hero section).
**Be able to answer:** What are the three kinds of state and where does each live? How does TanStack Query know when to refetch? Why does `RequireAuth` protect nothing on its own? How does the 502 retry work? How does the hero fit short windows?
**KB:** [FRONTEND_ARCHITECTURE](../01_ARCHITECTURE/FRONTEND_ARCHITECTURE.md), [FRONTEND_FILE_GUIDE](../02_CODEBASE/FRONTEND_FILE_GUIDE.md), [WEBSITE_STRUCTURE](../04_FEATURE_DEEP_DIVES/WEBSITE_STRUCTURE.md), [API_WAKE_UP](../04_FEATURE_DEEP_DIVES/API_WAKE_UP.md).

## Module 11: Testing

**Read:** `apps/api/vitest.config.ts`, `test/env.ts`, `global-setup.ts`, `setup.ts`, `helpers.ts`, one test file fully (`votes.test.ts`); `e2e/playwright.config.ts`, `fixtures.ts`, `tests/votes.spec.ts`; `.github/workflows/ci.yml`.
**Be able to answer:** Why a real database? How are tests isolated? How does the E2E `person` fixture log people in without the UI, and why? What does CI run, and what gates deployment?
**KB:** [TESTING_ARCHITECTURE](../09_TESTING_AND_DEPLOYMENT/TESTING_ARCHITECTURE.md), [UNIT_AND_INTEGRATION_TESTS](../09_TESTING_AND_DEPLOYMENT/UNIT_AND_INTEGRATION_TESTS.md), [E2E_TESTING](../09_TESTING_AND_DEPLOYMENT/E2E_TESTING.md), [CI_CD_EXPLAINED](../09_TESTING_AND_DEPLOYMENT/CI_CD_EXPLAINED.md).

## Module 12: Deployment

**Read:** `apps/api/scripts/build.ts`, `apps/api/Dockerfile`, `src/migrate.ts`, `render.yaml`, `apps/web/vercel.json`, `apps/web/Dockerfile` + `nginx/default.conf.template`, `scripts/setup-roles.ts`, `docs/DEPLOYMENT.md`.
**Be able to answer:** Why bundle the API? What does each Dockerfile line do? Why remove `MIGRATION_DATABASE_URL` before starting the server? Why the advisory lock? What does `ORIGIN_SECRET` prove, and why compare in constant time? Why Vercel and not Netlify?
**KB:** [INFRASTRUCTURE_AND_DEPLOYMENT](../01_ARCHITECTURE/INFRASTRUCTURE_AND_DEPLOYMENT.md), [DEPLOYMENT_GUIDE](../09_TESTING_AND_DEPLOYMENT/DEPLOYMENT_GUIDE.md).

## Module 13: Scaling lab

**Read:** `docs/SCALING.md`, `load/k6/browse.js`, `src/cache.ts`, `load/nginx.conf`, `src/mailer.ts` + `src/worker.ts`, `load/replica-entrypoint.sh`, `src/telemetry.ts`, `src/instrumentation.ts`.
**Be able to answer:** What was the first bottleneck and how do you know? How does versioned invalidation work, and why bump after commit? Why keep sessions in Postgres? Why did 4 instances not scale linearly? How does the LSN check give read-your-writes? Why is tracing opt-in?
**KB:** [SCALING_AND_INFRASTRUCTURE_EXPERIMENTS](../09_TESTING_AND_DEPLOYMENT/SCALING_AND_INFRASTRUCTURE_EXPERIMENTS.md), [INDEXING_AND_QUERY_OPTIMIZATION](../05_DATABASE/INDEXING_AND_QUERY_OPTIMIZATION.md).
