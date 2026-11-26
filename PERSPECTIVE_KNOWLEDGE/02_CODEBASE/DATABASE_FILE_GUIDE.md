# Database File Guide

Every file that defines, changes, connects to or fills the database.

| File                                          | Role                                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/db/schema.ts`                   | **The schema as TypeScript.** Source of truth for tables, enums, indexes and checks. Also gives TypeScript the row types (`typeof users.$inferSelect`).                                          |
| `apps/api/drizzle.config.ts`                  | drizzle-kit settings: dialect, schema path, output folder `./migrations`, `casing: "snake_case"`, `strict: true` (ask instead of guessing on renames), credentials from `MIGRATION_DATABASE_URL` |
| `apps/api/migrations/*.sql`                   | The generated (and three hand-edited) SQL, applied in order                                                                                                                                      |
| `apps/api/migrations/meta/_journal.json`      | The ordered list of migrations, which the migrator walks                                                                                                                                         |
| `apps/api/migrations/meta/00NN_snapshot.json` | drizzle-kit's picture of the schema after each migration; `db:generate` diffs `schema.ts` against the latest one                                                                                 |
| `apps/api/src/db/client.ts`                   | Connection pool + Drizzle instance (+ replica)                                                                                                                                                   |
| `apps/api/src/db/errors.ts`                   | Recognise unique violations                                                                                                                                                                      |
| `apps/api/src/migrate.ts`                     | Applies migrations in production under an advisory lock                                                                                                                                          |
| `apps/api/test/global-setup.ts`               | Applies migrations to `perspective_test` before the API tests                                                                                                                                    |
| `e2e/global-setup.ts`                         | Runs `db:migrate` against `perspective_test` and empties it before E2E                                                                                                                           |
| `docker/postgres/init/01-roles.sh`            | First start of a local volume: roles, the test and load databases, grants, default privileges                                                                                                    |
| `docker/postgres/init/02-replication.sh`      | First start: the `replicator` login for the lab replica + a `pg_hba.conf` line                                                                                                                   |
| `apps/api/scripts/setup-roles.ts`             | The same role setup for a hosted database (Neon)                                                                                                                                                 |
| `apps/api/scripts/seed.ts`                    | Sample data                                                                                                                                                                                      |
| `apps/api/scripts/set-role.ts`                | Change a user's role                                                                                                                                                                             |
| `apps/api/src/modules/votes/scores.ts`        | `recomputeScores()`: a bulk rebuild in SQL                                                                                                                                                       |
| `apps/api/src/modules/stances/counts.ts`      | `moveStanceCount` (per change) and `recountStances` (bulk)                                                                                                                                       |
| `load/replica-entrypoint.sh`                  | Clone the primary with `pg_basebackup`, then follow its WAL                                                                                                                                      |

## The migration list

| #    | File                               | Generated?                       | What it creates or changes                                                                                                                                | Phase         |
| ---- | ---------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 0000 | `0000_clumsy_lethal_legion.sql`    | yes                              | Enum `stance`                                                                                                                                             | 0             |
| 0001 | `0001_unusual_leper_queen.sql`     | yes                              | Enum `user_role`; tables `users`, `sessions`; lower-case unique indexes; username format check                                                            | 1             |
| 0002 | `0002_jittery_carnage.sql`         | yes                              | Enum `oauth_provider`; `oauth_accounts`, `oauth_pending`                                                                                                  | 1             |
| 0003 | `0003_spicy_shotgun.sql`           | yes                              | Enum `email_token_purpose`; `email_tokens`                                                                                                                | 1             |
| 0004 | `0004_enable_pg_trgm.sql`          | **hand-written**                 | `CREATE EXTENSION IF NOT EXISTS pg_trgm`                                                                                                                  | 2             |
| 0005 | `0005_cloudy_brood.sql`            | yes                              | Enum `question_status`; `questions` with generated `search_vector`, GIN and trigram indexes, length checks                                                | 2             |
| 0006 | `0006_broad_amazoness.sql`         | yes                              | `user_stances`, `stance_history`, `posts`; column index; one-live-post-per-side unique index                                                              | 3             |
| 0007 | `0007_clean_frog_thor.sql`         | yes                              | `post_votes`; score columns on posts; `posts_column_top_idx`                                                                                              | 4             |
| 0008 | `0008_flaky_mentallo.sql`          | yes                              | Enums for challenges/notifications; `challenges`, `comments`, `notifications`                                                                             | 5             |
| 0009 | `0009_fantastic_firebrand.sql`     | yes + **hand-appended REVOKE**   | Moderation enums; `reports`, `audit_log`; `removed_at` on posts and comments; `REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM perspective_app`         | 6             |
| 0010 | `0010_tricky_archangel.sql`        | yes                              | Rebuild both post column indexes with `where deleted_at is null and removed_at is null` (D66)                                                             | 9             |
| 0011 | `0011_mysterious_gorilla_man.sql`  | yes + **hand-appended backfill** | `for_count`, `neutral_count`, `against_count`; backfill `UPDATE` from `user_stances`; `questions_active_idx`, `questions_divided_idx`; non-negative check | after 9 (D74) |
| 0012 | `0012_puzzling_lenny_balinger.sql` | yes                              | Rebuild the two ranking indexes with `id DESC NULLS FIRST` to match `order by ... desc`                                                                   | after 9 (D74) |

Every migration is explained, with the reasoning behind it, in [MIGRATIONS_EXPLAINED.md](../05_DATABASE/MIGRATIONS_EXPLAINED.md).

## Who runs what, as which role

| Action                                | Command                                         | Role used                                     |
| ------------------------------------- | ----------------------------------------------- | --------------------------------------------- |
| Generate a migration from `schema.ts` | `pnpm db:generate`                              | migrator (reads the DB state, writes no data) |
| Apply migrations (dev)                | `pnpm db:migrate` (drizzle-kit)                 | `perspective_migrator`                        |
| Apply migrations (production)         | `node dist/migrate.js` on container start       | `perspective_migrator`                        |
| Serve requests                        | `node dist/server.js`                           | `perspective_app`                             |
| Seed, set-role, recompute-scores      | `pnpm seed` etc. (uses `DATABASE_URL`)          | `perspective_app`                             |
| Create roles (local)                  | init script, first volume start                 | `postgres` superuser                          |
| Create roles (Neon)                   | `pnpm db:setup-roles` with `OWNER_DATABASE_URL` | Neon owner                                    |
