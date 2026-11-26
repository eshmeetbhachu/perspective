# Technology Stack

Every dependency, what it does in Perspective, and where it is used. Versions are from the `package.json` files at commit `cdd117f`. A `^` means "this version or any newer one that doesn't change the first number"; `~` means "only newer patch versions"; no symbol means an exact pin.

For _why_ each was chosen over alternatives, see [TECHNOLOGY_SELECTION.md](../03_TECHNICAL_DECISIONS/TECHNOLOGY_SELECTION.md).

## Runtime and tooling (repository root)

| Tool                       | Version             | What it does here                                                                                          | Where                                                  |
| -------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Node.js                    | ≥ 22 (`.nvmrc`: 22) | Runs the API, the build tools and the tests. Node 22 is a long-term-support (LTS) line.                    | `package.json` `engines`, `.nvmrc`                     |
| pnpm                       | 12.8.1 (pinned)     | Package manager with **workspaces**: installs dependencies and links the four local projects together.     | `package.json` `packageManager`, `pnpm-workspace.yaml` |
| TypeScript                 | `~6.0.3`            | Type-checks every package. Pinned to 6.0 because typescript-eslint doesn't support TypeScript 7 yet (D18). | `tsconfig.base.json`                                   |
| ESLint + typescript-eslint | 10.x + 8.71         | Finds likely bugs, using type information (`strictTypeChecked`): e.g. a promise that is never awaited.     | `eslint.config.js`                                     |
| eslint-plugin-react-hooks  | 7.x                 | Enforces React's Rules of Hooks in `apps/web`.                                                             | `eslint.config.js`                                     |
| Prettier                   | 3.9.9 (pinned)      | Formats every file the same way. `pnpm format:check` fails CI on unformatted files.                        | `.prettierrc.json` (empty = defaults)                  |
| Docker / Docker Compose    | n/a                 | Runs Postgres and Redis locally, the production images, and the load-testing lab.                          | `docker-compose.yml`                                   |

## Backend (`apps/api`)

| Package                            | Version  | What it does here                                                                                                     | Main files                             |
| ---------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| fastify                            | ^5.12.7  | The HTTP server framework: routes, hooks, plugins, logging, `app.inject()` for tests.                                 | `src/app.ts`, every `routes.ts`        |
| fastify-type-provider-zod          | ^7.0.0   | Lets Fastify validate requests and serialize responses with **Zod** schemas, and gives handlers typed `request.body`. | `src/app.ts:46`                        |
| zod                                | ^4.6.7   | Validation for environment variables, request bodies/queries/params, and response shapes.                             | `src/config/env.ts`, `packages/shared` |
| drizzle-orm                        | ^0.45.3  | Type-safe query builder; also runs migrations at deploy time.                                                         | `src/db/`, every module                |
| drizzle-kit (dev)                  | ^0.31.11 | Command-line tool that **generates** SQL migration files from `schema.ts`.                                            | `drizzle.config.ts`                    |
| pg                                 | ^8.23.1  | The PostgreSQL driver (talks the Postgres wire protocol). Drizzle uses its connection `Pool`.                         | `src/db/client.ts`                     |
| @fastify/cookie                    | ^11.1.2  | Reads and sets cookies (`request.cookies`, `reply.setCookie`).                                                        | `modules/auth/sessions.ts`             |
| @fastify/cors                      | ^11.3.0  | Sends CORS headers that allow only `WEB_ORIGIN`.                                                                      | `src/app.ts:54`                        |
| @fastify/helmet                    | ^13.1.1  | Adds security headers (CSP, HSTS, X-Frame-Options, ...) to API responses.                                             | `src/app.ts:53`                        |
| @fastify/rate-limit                | ^11.2.1  | Per-route request limits (e.g. 10 logins per 15 minutes per IP). Uses Redis when configured.                          | `src/app.ts:56`, route `config`        |
| @node-rs/argon2                    | ^2.2.1   | Password hashing with **argon2id** (native Rust code, fast and memory-hard).                                          | `modules/auth/passwords.ts`            |
| openid-client                      | ^6.8.8   | Certified OpenID Connect client for Google sign-in (state, PKCE, nonce, ID-token verification).                       | `modules/auth/google.ts`               |
| nodemailer                         | ^10.1.7  | Sends email over SMTP from one `SMTP_URL`.                                                                            | `src/mailer.ts`                        |
| pino                               | ^10.3.1  | Structured JSON logging (Fastify's built-in logger); `pino-pretty` (dev) prints readable lines locally.               | `src/config/logger.ts`                 |
| ioredis                            | ^6.0.0   | Redis client for the cache, rate limits and the queue (lab only).                                                     | `src/cache.ts`, `src/worker.ts`        |
| bullmq                             | 6.3.12   | Job queue on Redis: emails are queued and sent by a worker with retries (lab only).                                   | `src/mailer.ts`, `src/worker.ts`       |
| prom-client                        | 15.1.3   | Prometheus metrics (request durations, cache hits) on a private port (lab only).                                      | `src/telemetry.ts`                     |
| @opentelemetry/* + @fastify/otel   | various  | Distributed tracing of requests, Postgres queries and Redis commands, exported to Jaeger (lab only, opt-in).          | `src/instrumentation.ts`               |
| tsx (dev)                          | ^4.23.15 | Runs TypeScript directly in development (`tsx watch`), with no separate compile step.                                 | `apps/api/package.json` scripts        |
| esbuild (dev)                      | ^0.28.2  | Bundles the API into plain JavaScript for production (`dist/server.js` etc.).                                         | `scripts/build.ts`                     |
| vitest + @vitest/coverage-v8 (dev) | ^5.0.3   | Test runner and coverage.                                                                                             | `test/`, `vitest.config.ts`            |

## Frontend (`apps/web`)

| Package                    | Version  | What it does here                                                                                 | Main files                         |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------- | ---------------------------------- |
| react, react-dom           | ^19.3.0  | The UI library: components, state, rendering.                                                     | every `.tsx`                       |
| vite (dev)                 | ^8.3.4   | Dev server with instant reload, the `/api` proxy in development, and the production build.        | `vite.config.ts`                   |
| @vitejs/plugin-react (dev) | ^6.1.1   | JSX transform and fast refresh for Vite.                                                          | `vite.config.ts`                   |
| react-router               | ^8.4.0   | Client-side routing (`/q/:slug`, `/posts/:id`, ...), declarative `<Routes>`.                      | `src/App.tsx`                      |
| @tanstack/react-query      | ^5.104.0 | Server-state cache: loading, caching, refetching, infinite lists, mutations.                      | `src/auth.ts`, `questions.ts`, ... |
| marked                     | ^18.0.14 | Converts Markdown post bodies to HTML.                                                            | `src/markdown.ts`                  |
| dompurify                  | ^3.4.17  | Removes anything dangerous from that HTML (scripts, event handlers, images, `javascript:` links). | `src/markdown.ts`                  |
| zod                        | ^4.6.7   | The shared schemas validate forms in the browser before sending.                                  | `src/forms.ts`                     |
| @fontsource/open-sauce-one | ^5.3.0   | Self-hosted font files, so no third-party font request (D55).                                     | `src/main.tsx`                     |
| jsdom (dev)                | ^30.1.1  | A fake browser DOM for unit tests.                                                                | `vitest.config.ts`                 |

**HISTORY:** TanStack Query is pinned at `^5.104.0`. 5.104.1 was too new for pnpm's release-age policy (a guard that refuses packages published very recently, to protect against hijacked releases), so the commit `69ac451` pinned the previous version.

## Shared (`packages/shared`)

Only **zod**. The package must run in both the browser and Node, so its `tsconfig.json` loads neither DOM nor Node types: it can only use plain JavaScript features.

## End-to-end tests (`e2e`)

| Package          | Version | What it does here                                                                                   |
| ---------------- | ------- | --------------------------------------------------------------------------------------------------- |
| @playwright/test | ^1.63.0 | Drives a real Chromium browser through the site.                                                    |
| pg               | ^8.23.1 | Creates test users and sessions directly in the database, so tests skip sign-up and its rate limit. |

## Databases and services

| Service                     | Where                                          | Version                   | Role                                                                                    |
| --------------------------- | ---------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| PostgreSQL                  | Docker locally; **Neon** in production         | 18 (`postgres:18-alpine`) | The only source of truth. Postgres 18 is required for the built-in `uuidv7()` function. |
| pg_trgm                     | Postgres extension (migration `0004`)          | built in                  | Trigram similarity for "did you mean…?".                                                |
| pg_stat_statements          | Postgres extension (local Docker only)         | built in                  | Records time spent per query (Phase 9 analysis).                                        |
| Redis                       | Docker locally (`redis:8.2-alpine`)            | 8.2                       | Cache, rate limits, job queue, replica positions. **Not used in production.**           |
| Mailpit                     | Docker (`app` profile)                         | 1.29                      | A fake inbox that catches emails from the local production images.                      |
| nginx                       | Web image (unprivileged) and lab load balancer | 1.29                      | Serves the built website and proxies `/api`; spreads lab traffic over API instances.    |
| k6                          | Docker (`load` profile)                        | 1.0.0                     | Load-testing tool that simulates visitors.                                              |
| Prometheus, Grafana, Jaeger | Docker (`load` profile)                        | 3.5 / 12.0 / 2.5          | Metrics storage, dashboards, trace viewer.                                              |

## Hosting (production, all free, no card)

| Service        | Hosts                                  | Notes                                                                              |
| -------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| Vercel (Hobby) | The built website and the `/api` proxy | `apps/web/vercel.json`; adds the `x-origin-secret` header.                         |
| Render (free)  | The API Docker container               | `render.yaml`; sleeps after 15 idle minutes; deploys only commits that passed CI.  |
| Neon (free)    | PostgreSQL 18, Singapore region        | 0.25 compute units; 6-hour restore history.                                        |
| Brevo (free)   | SMTP email on port 2525                | 300 emails/day; port 2525 because Render's free plan blocks ports 25, 465 and 587. |
| GitHub Actions | CI                                     | `.github/workflows/ci.yml`                                                         |

Details: [INFRASTRUCTURE_AND_DEPLOYMENT.md](../01_ARCHITECTURE/INFRASTRUCTURE_AND_DEPLOYMENT.md).
