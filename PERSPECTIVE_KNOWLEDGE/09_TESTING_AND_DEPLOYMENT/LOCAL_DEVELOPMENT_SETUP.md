# Local Development Setup

The authoritative steps are in `README.md`; this is the same path with the _why_ added.

## Prerequisites

| Tool                                  | Why                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| Node.js 22+                           | runs everything (`.nvmrc` = 22)                                                |
| Docker Desktop                        | Postgres 18 and Redis in containers                                            |
| pnpm via Corepack (`corepack enable`) | Corepack reads `"packageManager": "pnpm@12.8.1"` and uses exactly that version |

## Steps

```sh
pnpm install                     # 1. dependencies for all workspace packages
cp .env.example .env             # 2. then replace every change-me (letters and digits only)
docker compose up -d             # 3. postgres + redis
docker compose ps                #    wait for "(healthy)"
pnpm db:migrate                  # 4. create the tables (as perspective_migrator)
pnpm dev:api                     # 5. API on http://127.0.0.1:3000 (auto-restart on save)
pnpm dev:web                     # 6. website on http://localhost:5173 (second terminal)
```

Check: `curl http://127.0.0.1:3000/health` and `/health/ready` → `{"status":"ok"}`.

### What happens on the first `docker compose up`

The empty `pgdata` volume triggers `docker/postgres/init/*.sh`: the two roles get the passwords from `.env`, and the `perspective_test` and `perspective_load` databases are created with the same grants. **The passwords are applied only then.** If you change them later, `docker compose down -v` (deletes all local data) and start again.

The passwords inside `DATABASE_URL` and `MIGRATION_DATABASE_URL` must match `APP_PASSWORD` and `MIGRATOR_PASSWORD` ("letters and digits only", so they don't need URL-escaping).

### Why `localhost`, not `127.0.0.1`, for the website

`WEB_ORIGIN=http://localhost:5173`. The API accepts writes only from that exact origin; `http://127.0.0.1:5173` is a different origin, and every form would fail with "Cross-site request blocked".

### Emails in development

No `SMTP_URL` → each email is printed in the API terminal. Copy the verification or reset link from there.

### Becoming a moderator locally

```sh
pnpm set-role you@example.com moderator     # or admin
```

### Sample data

```sh
pnpm seed                               # 50 users, 30 questions with posts, votes, debates
pnpm seed --users 500 --questions 200
pnpm seed --clear                       # removes only @seed.example accounts (and their content)
```

Seeded accounts use the password `seed-password-123`. The seed refuses to run with `NODE_ENV=production`. It uses curated debate questions and argument sentences instead of lorem ipsum, backdates rows and generates matching UUIDv7s so "Newest" sorting agrees with the dates shown, then rebuilds scores and stance counts (D54).

### Google sign-in locally (optional)

Create an OAuth client in Google Cloud Console with origin `http://localhost:5173` and redirect `http://localhost:5173/api/auth/google/callback`; put the id and secret in `.env`; restart the API. Steps in `README.md`.

## Running the production images locally

```sh
docker compose --profile app up -d --build
```

- http://localhost:4173: the site via nginx, proxying `/api` to the API container.
- http://localhost:8025: Mailpit, catching every email.
- The API container migrates first, then serves. The worker container sends queued emails (Redis is on in this profile).
- `TRUST_PROXY=uniquelocal` because requests arrive from the web container on Docker's private network.

## Daily commands

| Command            | Does                                    |
| ------------------ | --------------------------------------- |
| `pnpm typecheck`   | type-check all packages                 |
| `pnpm lint`        | ESLint                                  |
| `pnpm format`      | Prettier (write)                        |
| `pnpm test`        | unit + API tests (Docker must be up)    |
| `pnpm test:e2e`    | browser tests                           |
| `pnpm db:generate` | new migration after editing `schema.ts` |
| `pnpm db:migrate`  | apply migrations                        |
| `pnpm build`       | web production build                    |

## Changing the database schema (workflow)

1. Edit `apps/api/src/db/schema.ts`.
2. `pnpm db:generate`, then read the new SQL; add backfills or grants by hand if needed.
3. `pnpm db:migrate`.
4. Update shared schemas/types, routes and tests.
5. `pnpm test`: the test database is migrated automatically.
