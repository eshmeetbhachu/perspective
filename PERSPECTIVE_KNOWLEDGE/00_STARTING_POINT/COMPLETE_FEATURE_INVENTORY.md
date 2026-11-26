# Complete Feature Inventory

Every feature, checked against the code in November 2026 (commit `cdd117f`). The status categories:

| Status                    | Meaning                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| ✅ **Implemented**        | Code exists, is wired into the app, and has tests.                                               |
| 🌐 **Deployed**           | Running on the live site (https://perspective-lilac.vercel.app) and checked there.               |
| 🧪 **Local lab only**     | Implemented, but only switched on in the local load-testing lab (Docker Compose `load` profile). |
| ⚙️ **Implemented, off**   | Implemented and tested, but switched off in production by configuration.                         |
| 🟠 **Partial**            | Part of it exists; the gap is described.                                                         |
| ⬜ **Planned, not built** | Mentioned in the roadmap or schema, but no working code.                                         |
| ❌ **Removed**            | Built once, then deliberately removed.                                                           |

"Deployed" was checked on the live site with read-only requests: `/api/health/ready` answered `ok`, `/api/auth/providers` answered `{"google":false}`, the question list returned data, and response headers showed HSTS and `Cache-Control: no-store`.

## Accounts and authentication

| Feature                                                    | Status | Where                                                                                                                                                         | Deep dive                                                                                                  |
| ---------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Sign up with email + password (argon2id)                   | ✅ 🌐  | `apps/api/src/modules/auth/routes.ts:32`                                                                                                                      | [AUTH_EMAIL_AND_PASSWORD](../04_FEATURE_DEEP_DIVES/AUTH_EMAIL_AND_PASSWORD.md)                             |
| Log in / log out / "who am I"                              | ✅ 🌐  | `auth/routes.ts:55`, `:90`, `:98`                                                                                                                             | same                                                                                                       |
| Session cookies (httpOnly, hashed token, 30-day, renewing) | ✅ 🌐  | `auth/sessions.ts`                                                                                                                                            | [COOKIE_SECURITY](../07_SECURITY/COOKIE_SECURITY.md)                                                       |
| Email verification (24 h, single-use links)                | ✅ 🌐  | `auth/email-routes.ts`, `auth/email-tokens.ts`                                                                                                                | [EMAIL_VERIFICATION_AND_PASSWORD_RESET](../04_FEATURE_DEEP_DIVES/EMAIL_VERIFICATION_AND_PASSWORD_RESET.md) |
| Forgot / reset password (30-minute links)                  | ✅ 🌐  | `auth/email-routes.ts:60`, `:83`                                                                                                                              | same                                                                                                       |
| Sign in with Google (OpenID Connect, PKCE, nonce)          | ✅ ⚙️  | `auth/google.ts`, `auth/google-routes.ts`. Off in production: `GOOGLE_CLIENT_ID`/`SECRET` are not set on Render (live `/auth/providers` = `{"google":false}`) | [AUTH_GOOGLE_OAUTH](../04_FEATURE_DEEP_DIVES/AUTH_GOOGLE_OAUTH.md)                                         |
| Secure Google account linking (no auto-link by email)      | ✅ ⚙️  | `auth/oauth.ts`                                                                                                                                               | same                                                                                                       |
| Roles user / moderator / admin with ranked guards          | ✅ 🌐  | `apps/api/src/plugins/auth.ts`                                                                                                                                | [ROLES_AND_GUARDS](../04_FEATURE_DEEP_DIVES/ROLES_AND_GUARDS.md)                                           |
| Change role (`pnpm set-role`)                              | ✅ CLI | `apps/api/scripts/set-role.ts`. No web UI for role changes (D36).                                                                                             | same                                                                                                       |
| Rate limits on auth routes                                 | ✅ 🌐  | per route `config.rateLimit`                                                                                                                                  | [SECURITY_OVERVIEW](../07_SECURITY/SECURITY_OVERVIEW.md)                                                   |
| Change password while logged in                            | ⬜     | Not built. Only "forgot password" by email exists.                                                                                                            | [KNOWN_LIMITATIONS](../08_BUGS_AND_DEBUGGING/KNOWN_LIMITATIONS.md)                                         |
| Delete my account                                          | ⬜     | Not built. The schema is ready for it (`on delete set null` keeps posts and questions), and tests simulate a deletion directly in SQL.                        | same                                                                                                       |
| "Log out everywhere" / list my sessions                    | ⬜     | Not built. The `sessions.id` column and `sessions_user_id_idx` index were designed for it (`schema.ts:66`, `:85`).                                            | same                                                                                                       |
| User profile pages                                         | ⬜     | The roadmap's module layout lists `users/ profiles`; no such module or page exists.                                                                           | same                                                                                                       |

## Questions

| Feature                                                  | Status | Where                                                                                                                           | Deep dive                                                                    |
| -------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Ask a question (verified email, 5 a day)                 | ✅ 🌐  | `modules/questions/routes.ts:134`                                                                                               | [QUESTIONS](../04_FEATURE_DEEP_DIVES/QUESTIONS.md)                           |
| Readable slugs (`/q/should-voting-be-mandatory`)         | ✅ 🌐  | `modules/questions/slugs.ts`                                                                                                    | same                                                                         |
| Browse: Newest / Most active / Most divided              | ✅ 🌐  | `questions/routes.ts:179`                                                                                                       | same                                                                         |
| Stance counts on each question (For / Neutral / Against) | ✅ 🌐  | `modules/stances/counts.ts`                                                                                                     | [STANCES](../04_FEATURE_DEEP_DIVES/STANCES.md)                               |
| Full-text search                                         | ✅ 🌐  | `questions/routes.ts:227`                                                                                                       | [SEARCH_AND_SUGGESTIONS](../04_FEATURE_DEEP_DIVES/SEARCH_AND_SUGGESTIONS.md) |
| "Did you mean…?" duplicate suggestions while typing      | ✅ 🌐  | `questions/routes.ts:251`                                                                                                       | same                                                                         |
| Review-first publishing (`pending` status)               | ⬜     | The `question_status` enum includes `pending` (`schema.ts:150`), but no code ever sets it. Questions publish immediately (D37). | [QUESTIONS](../04_FEATURE_DEEP_DIVES/QUESTIONS.md)                           |

## Stances, posts, votes

| Feature                                                    | Status | Where                                    | Deep dive                                                          |
| ---------------------------------------------------------- | ------ | ---------------------------------------- | ------------------------------------------------------------------ |
| Declare / change stance, once per 24 h, with history       | ✅ 🌐  | `modules/stances/routes.ts:56`           | [STANCES](../04_FEATURE_DEEP_DIVES/STANCES.md)                     |
| Write / edit / soft-delete a post (one live post per side) | ✅ 🌐  | `modules/posts/routes.ts`                | [POSTS](../04_FEATURE_DEEP_DIVES/POSTS.md)                         |
| Markdown with sanitized rendering                          | ✅ 🌐  | `apps/web/src/markdown.ts`               | same, and [CSRF_CORS_AND_XSS](../07_SECURITY/CSRF_CORS_AND_XSS.md) |
| Three columns with Top / Hot / New and cursor paging       | ✅ 🌐  | `posts/routes.ts:40`, `posts/ranking.ts` | [VOTES_AND_RANKING](../04_FEATURE_DEEP_DIVES/VOTES_AND_RANKING.md) |
| "Helped me understand" votes with cross-side weights       | ✅ 🌐  | `modules/votes/routes.ts`                | same                                                               |
| "Valued across sides" badge (3+ cross-side votes)          | ✅ 🌐  | `PostCard.tsx:23`                        | same                                                               |
| Recompute all scores after changing weights                | ✅ CLI | `pnpm recompute-scores`                  | same                                                               |
| Post page (full post + its challenges)                     | ✅ 🌐  | `apps/web/src/pages/PostPage.tsx`        | [POSTS](../04_FEATURE_DEEP_DIVES/POSTS.md)                         |

## Challenges, threads, notifications

| Feature                                                     | Status | Where                              | Deep dive                                                                    |
| ----------------------------------------------------------- | ------ | ---------------------------------- | ---------------------------------------------------------------------------- |
| Challenge a post (one per person per post, 5 a day)         | ✅ 🌐  | `modules/challenges/routes.ts:93`  | [CHALLENGES_AND_THREADS](../04_FEATURE_DEEP_DIVES/CHALLENGES_AND_THREADS.md) |
| Threaded comments, recursive CTE, 5 levels per page, max 50 | ✅ 🌐  | `modules/challenges/thread.ts`     | same                                                                         |
| "Continue this thread" for deep chains                      | ✅ 🌐  | `thread.ts:58`, `Thread.tsx:190`   | same                                                                         |
| Delete own comment (placeholder stays)                      | ✅ 🌐  | `thread.ts:217`                    | same                                                                         |
| Edit a comment                                              | ⬜     | Not built ("not edited yet", D48). | same                                                                         |
| Notifications (challenged / replied to), polled every 60 s  | ✅ 🌐  | `modules/notifications/`           | [NOTIFICATIONS](../04_FEATURE_DEEP_DIVES/NOTIFICATIONS.md)                   |

## Moderation

| Feature                                                     | Status | Where                                               | Deep dive                                            |
| ----------------------------------------------------------- | ------ | --------------------------------------------------- | ---------------------------------------------------- |
| Report a question, post, challenge or comment (20 a day)    | ✅ 🌐  | `modules/moderation/routes.ts:61`                   | [MODERATION](../04_FEATURE_DEEP_DIVES/MODERATION.md) |
| Review queue grouped per item, most reported first          | ✅ 🌐  | `moderation/routes.ts:112`                          | same                                                 |
| Remove / restore / dismiss, with a required note            | ✅ 🌐  | `moderation/routes.ts:162`–`228`                    | same                                                 |
| Ban / unban (bans end every session)                        | ✅ 🌐  | `moderation/routes.ts:232`, `:262`                  | same                                                 |
| Append-only audit log (database-enforced)                   | ✅ 🌐  | migration `0009`, `REVOKE UPDATE, DELETE, TRUNCATE` | same                                                 |
| Automated spam checks (duplicates refused, signals flagged) | ✅ 🌐  | `modules/moderation/spam.ts`                        | same                                                 |

## Website

| Feature                                                  | Status | Where                                                                                 | Deep dive                                                          |
| -------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Landing page (hero, how it works, active questions, CTA) | ✅ 🌐  | `pages/HomePage.tsx`                                                                  | [WEBSITE_STRUCTURE](../04_FEATURE_DEEP_DIVES/WEBSITE_STRUCTURE.md) |
| `/questions` browse page with search and sorting         | ✅ 🌐  | `pages/QuestionsPage.tsx`                                                             | same                                                               |
| Phone layout: menu button, column tabs                   | ✅ 🌐  | `SiteHeader.tsx`, `QuestionPage.tsx:112`                                              | same                                                               |
| Split-screen log in / sign up                            | ✅ 🌐  | `components/AuthLayout.tsx`                                                           | same                                                               |
| 404 page and per-page titles                             | ✅ 🌐  | `NotFoundPage.tsx`, `title.ts`                                                        | same                                                               |
| Wake the sleeping free API from the browser              | ✅ 🌐  | `apps/web/src/api.ts:26`                                                              | [API_WAKE_UP](../04_FEATURE_DEEP_DIVES/API_WAKE_UP.md)             |
| Dark mode                                                | ❌     | Removed in the October redesign (D55): the artwork is cream, so a dark theme clashed. | same                                                               |

## Infrastructure and scaling

| Feature                                                           | Status                            | Where                                                                                                        | Deep dive                                                                                                        |
| ----------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Docker images for API and web                                     | ✅ (API image 🌐 on Render)       | `apps/api/Dockerfile`, `apps/web/Dockerfile`                                                                 | [INFRASTRUCTURE_AND_DEPLOYMENT](../01_ARCHITECTURE/INFRASTRUCTURE_AND_DEPLOYMENT.md)                             |
| Migrations on deploy, under an advisory lock                      | ✅ 🌐                             | `apps/api/src/migrate.ts`                                                                                    | [MIGRATIONS_EXPLAINED](../05_DATABASE/MIGRATIONS_EXPLAINED.md)                                                   |
| CI on every push (format, types, lint, audit, tests, e2e, builds) | ✅ 🌐 (GitHub Actions)            | `.github/workflows/ci.yml`                                                                                   | [CI_CD_EXPLAINED](../09_TESTING_AND_DEPLOYMENT/CI_CD_EXPLAINED.md)                                               |
| Dependabot weekly updates                                         | ✅ 🌐                             | `.github/dependabot.yml`                                                                                     | same                                                                                                             |
| Proxy secret (`ORIGIN_SECRET`) between Vercel and Render          | ✅ 🌐                             | `plugins/proxy-secret.ts`, `apps/web/vercel.json`                                                            | [SECURITY_DECISIONS](../03_TECHNICAL_DECISIONS/SECURITY_DECISIONS.md)                                            |
| SMTP email (Brevo in production)                                  | ✅ 🌐                             | `apps/api/src/mailer.ts`                                                                                     | [EMAIL_VERIFICATION_AND_PASSWORD_RESET](../04_FEATURE_DEEP_DIVES/EMAIL_VERIFICATION_AND_PASSWORD_RESET.md)       |
| Redis response cache for logged-out visitors                      | 🧪                                | `apps/api/src/cache.ts`                                                                                      | [SCALING_AND_INFRASTRUCTURE_EXPERIMENTS](../09_TESTING_AND_DEPLOYMENT/SCALING_AND_INFRASTRUCTURE_EXPERIMENTS.md) |
| Rate limits counted in Redis                                      | 🧪                                | `app.ts:56`                                                                                                  | same                                                                                                             |
| BullMQ email queue + separate worker                              | 🧪                                | `mailer.ts`, `worker.ts`                                                                                     | same                                                                                                             |
| Several API instances behind nginx                                | 🧪                                | `load/nginx.conf`                                                                                            | same                                                                                                             |
| Read replica with read-your-writes                                | 🧪                                | `cache.ts:89`, `load/replica-entrypoint.sh`                                                                  | same                                                                                                             |
| Prometheus metrics, Grafana dashboard                             | 🧪                                | `apps/api/src/telemetry.ts`                                                                                  | same                                                                                                             |
| OpenTelemetry tracing to Jaeger                                   | 🧪                                | `apps/api/src/instrumentation.ts`                                                                            | same                                                                                                             |
| Dedicated search engine (Meilisearch)                             | ⬜ (decided against for now, D72) | Shown in the roadmap's "scaled architecture" diagram only.                                                   | same                                                                                                             |
| Custom domain                                                     | ⬜                                | Phase 8 optional item                                                                                        | [CURRENT_PROJECT_STATUS](CURRENT_PROJECT_STATUS.md)                                                              |
| Backups beyond Neon's 6-hour history                              | ⬜                                | Phase 8 optional item                                                                                        | same                                                                                                             |
| Error monitoring (e.g. Sentry)                                    | ⬜                                | Phase 8 optional item                                                                                        | same                                                                                                             |
| Content-Security-Policy on the website's pages                    | ⬜                                | Helmet adds a CSP to **API** responses only; Vercel serves the HTML pages with no CSP header (checked live). | [SECURITY_TRADEOFFS](../07_SECURITY/SECURITY_TRADEOFFS.md)                                                       |

## Developer tooling

| Feature                                | Status             | Where                                                     |
| -------------------------------------- | ------------------ | --------------------------------------------------------- |
| Seed script with realistic debate data | ✅                 | `apps/api/scripts/seed.ts` (`pnpm seed`)                  |
| Hosted-database role setup             | ✅ (used for Neon) | `apps/api/scripts/setup-roles.ts` (`pnpm db:setup-roles`) |
| Load-test fixtures and k6 scripts      | 🧪                 | `apps/api/scripts/load-fixtures.ts`, `load/k6/`           |
| Coverage report                        | ✅                 | `pnpm test:coverage`                                      |
