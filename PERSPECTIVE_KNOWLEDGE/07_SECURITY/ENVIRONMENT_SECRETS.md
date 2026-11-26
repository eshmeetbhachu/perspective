# Environment Variables and Secrets

## The rule

Configuration that differs between machines, and anything secret, lives in **environment variables**, never in code. Locally they come from one root `.env` file (gitignored, D21); on Render and Vercel they're typed into each dashboard. `.env.example` (committed) lists every name with fake values and comments.

## How the API loads them

- **Development:** `tsx watch --env-file=../../.env src/server.ts`. `--env-file` is Node's built-in loader, so no `dotenv` dependency is needed.
- **Scripts and drizzle-kit:** `process.loadEnvFile("../../.env")` if the file exists (`drizzle.config.ts`, `test/env.ts`).
- **Production:** the platform injects them; there is no file.
- **Validation:** `apps/api/src/config/env.ts` (Zod) runs before anything else and exits on any problem, naming the variable but never printing its value. Empty values (`GOOGLE_CLIENT_ID=`) count as "not set".

## Every variable

| Variable                                                           | Secret? | Required                        | Used for                                                                        |
| ------------------------------------------------------------------ | ------- | ------------------------------- | ------------------------------------------------------------------------------- |
| `POSTGRES_SUPERUSER_PASSWORD`, `MIGRATOR_PASSWORD`, `APP_PASSWORD` | yes     | local Docker                    | read by `docker-compose.yml` and the init script, only on first volume creation |
| `REPLICATION_PASSWORD`                                             | yes     | lab                             | replica login (defaults to a lab-only value)                                    |
| `NODE_ENV`                                                         | no      | default `development`           | secure cookies, SMTP requirement, pretty logs, test behaviour                   |
| `HOST`, `PORT`                                                     | no      | defaults                        | listen address                                                                  |
| `LOG_LEVEL`                                                        | no      | default `info`                  |                                                                                 |
| `WEB_ORIGIN`                                                       | no      | default `http://localhost:5173` | CSRF origin, CORS, links in emails, redirects                                   |
| `DATABASE_URL`                                                     | **yes** | **yes**                         | `perspective_app` connection                                                    |
| `MIGRATION_DATABASE_URL`                                           | **yes** | for migrations                  | `perspective_migrator`; **removed** before the production server starts         |
| `DATABASE_REPLICA_URL`                                             | yes     | optional (lab)                  | read replica                                                                    |
| `GOOGLE_CLIENT_ID`                                                 | no*     | optional                        | Google sign-in (*not secret, but kept in env with its pair)                     |
| `GOOGLE_CLIENT_SECRET`                                             | **yes** | optional                        | Google sign-in                                                                  |
| `GOOGLE_REDIRECT_URI`                                              | no      | default localhost               | must match Google Cloud Console                                                 |
| `TRUST_PROXY`                                                      | no      | optional                        | trusted proxy addresses; can't be combined with `ORIGIN_SECRET`                 |
| `ORIGIN_SECRET`                                                    | **yes** | production                      | ≥32 chars; shared with Vercel                                                   |
| `SMTP_URL`                                                         | **yes** | **production**                  | includes the SMTP login and key                                                 |
| `EMAIL_FROM`                                                       | no      | default                         | sender                                                                          |
| `REDIS_URL`                                                        | maybe   | optional (lab)                  | cache, rate limits, queue                                                       |
| `METRICS_PORT`                                                     | no      | optional (lab)                  | private Prometheus port                                                         |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`                 | no      | optional (lab)                  | tracing                                                                         |
| `OWNER_DATABASE_URL`                                               | **yes** | once                            | only for `pnpm db:setup-roles`, set in the shell and then removed               |
| Vercel: `API_ORIGIN`                                               | no      | production                      | the proxy target                                                                |
| Vercel: `ORIGIN_SECRET`                                            | **yes** | production                      | added as a header by the proxy                                                  |
| Vercel: `VITE_API_WAKE_URL`                                        | **no**  | production                      | compiled into public JS                                                         |

## Protections around secrets

| Protection                                          | Where                                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| `.env` and `.env.*` gitignored (except the example) | `.gitignore`                                                                  |
| Kept out of Docker build contexts                   | `.dockerignore`                                                               |
| Not in any image layer                              | images receive env at runtime only                                            |
| Not in `render.yaml`                                | every secret is `sync: false` (asked for in the dashboard)                    |
| Vercel secrets scoped to Production                 | preview deployments of branches can't reach the real API                      |
| Never logged                                        | Pino redaction; env errors print names only; emails masked                    |
| Least privilege                                     | the server never holds the migrator URL (`env -u` in the Dockerfile CMD)      |
| Throwaway values in CI                              | `ci.yml` uses `ci-superuser`, `ci-app`… for a database that lives for one run |
| Generated, not chosen                               | `setup-roles.ts` creates random 24-byte passwords and prints them once        |

**`VITE_` prefix warning:** Vite exposes only `VITE_*` variables to browser code, and **inlines** them into the public bundle. Anything with that prefix is public. Vercel's dashboard warns about it; for `VITE_API_WAKE_URL` that's intended.

**Working practice recorded in the project:** the owner pasted secrets only into host dashboards, never into a chat or a commit; Claude checked `.env` only with scripts that printed booleans or lengths, never values.

## Rotating a secret (procedure)

1. `ORIGIN_SECRET`: generate a new value (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`); set it on Vercel and Render; redeploy both. There's a brief window of 403s between the two deploys.
2. Database passwords: `ALTER ROLE perspective_app PASSWORD '…'` as the owner; update `DATABASE_URL` on Render.
3. `SMTP_URL`: generate a new key in Brevo; update Render; revoke the old key.
