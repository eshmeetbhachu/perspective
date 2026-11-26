# Schema Explanation: Every Table and Column

Source: `apps/api/src/db/schema.ts`. TypeScript names are camelCase; database names are snake_case (`casing: "snake_case"`), e.g. `passwordHash` ↔ `password_hash`. `timestamptz` = `timestamp with time zone`.

## Reading the Drizzle schema

```ts
export const users = pgTable(
  "users", // table name
  {
    // columns
    id: id(), // helper: uuid().primaryKey().default(sql`uuidv7()`)
    username: text().notNull(),
    passwordHash: text(), // no .notNull() → nullable
    role: userRoleEnum().notNull().default("user"),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    // indexes and constraints; t = the columns
    uniqueIndex("users_email_lower_unique").on(sql`lower(${t.email})`),
    check("users_username_format", sql`${t.username} ~ '^[A-Za-z0-9_]{3,20}$'`),
  ],
);
```

`typeof users.$inferSelect` is the TypeScript type of a row read from the table; `$inferInsert` is the type for inserting (columns with defaults become optional).

## Enums

| Enum                  | Values                                                          | Source                                   |
| --------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| `stance`              | for, neutral, against                                           | `STANCES` from `@perspective/shared`     |
| `user_role`           | user, moderator, admin                                          | `USER_ROLES` from shared                 |
| `oauth_provider`      | google                                                          | schema                                   |
| `email_token_purpose` | verify_email, reset_password                                    | schema                                   |
| `question_status`     | pending (unused), published, removed                            | schema                                   |
| `challenge_status`    | open, removed                                                   | schema                                   |
| `notification_type`   | post_challenged, comment_reply                                  | schema                                   |
| `report_target`       | question, post, challenge, comment                              | schema (mirrors shared `REPORT_TARGETS`) |
| `report_reason`       | spam, harassment, hate, misleading, off_topic, other, automated | schema                                   |
| `report_status`       | open, resolved, dismissed                                       | schema                                   |
| `audit_action`        | remove, restore, dismiss_reports, ban_user, unban_user          | schema                                   |

---

## `users`

| Column              | Type        | Null? | Default  | Meaning                                                              |
| ------------------- | ----------- | ----- | -------- | -------------------------------------------------------------------- |
| `id`                | uuid PK     | no    | uuidv7() |                                                                      |
| `username`          | text        | no    |          | 3–20 of `[A-Za-z0-9_]` (check `users_username_format`)               |
| `email`             | text        | no    |          | stored as typed (lower-cased by the shared schema)                   |
| `password_hash`     | text        | yes   |          | argon2id string (includes salt and parameters); null for Google-only |
| `role`              | user_role   | no    | 'user'   |                                                                      |
| `email_verified_at` | timestamptz | yes   |          | null = unverified                                                    |
| `banned_at`         | timestamptz | yes   |          | null = not banned                                                    |
| `created_at`        | timestamptz | no    | now()    | also used for the 24 h voting age and spam checks                    |

Indexes: unique `lower(email)`, unique `lower(username)`.

An argon2id hash looks like `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`. It carries its own parameters and random salt, so `verify()` needs nothing else, and the parameters can be raised later without breaking old hashes.

## `sessions`

| Column       | Type                     | Null? | Meaning                                                 |
| ------------ | ------------------------ | ----- | ------------------------------------------------------- |
| `id`         | uuid PK                  | no    | refer to a session without exposing the token           |
| `user_id`    | uuid FK → users, cascade | no    |                                                         |
| `token_hash` | text                     | no    | hex SHA-256 of the cookie value (unique index)          |
| `expires_at` | timestamptz              | no    | 30 days, sliding                                        |
| `created_at` | timestamptz              | no    |                                                         |
| `ip`         | inet                     | yes   | the client IP at login (real one, thanks to trustProxy) |
| `user_agent` | text                     | yes   | truncated to 500 characters                             |

Indexes: unique `token_hash` (every request), `user_id` (delete all of a user's sessions). `inet` is a Postgres type for IPv4/IPv6 addresses, validated on insert.

## `oauth_accounts`

| Column             | Type                     | Meaning        |
| ------------------ | ------------------------ | -------------- |
| `provider`         | oauth_provider           | "google"       |
| `provider_user_id` | text                     | Google's `sub` |
| `user_id`          | uuid FK → users, cascade |                |
| `created_at`       | timestamptz              |                |

PK `(provider, provider_user_id)`: a Google account links to at most one user. Unique `(user_id, provider)`: a user has at most one Google account.

## `oauth_pending`

`id`, `token_hash` (unique), `provider`, `provider_user_id`, `email`, `expires_at` (15 min), `created_at`. No foreign key: no user exists yet. **Note:** expired pending rows are never actively deleted; they're ignored by `findPending` (`expires_at > now()`). They're small and rare. **(Observation.)**

## `email_tokens`

`id`, `user_id` (FK cascade, indexed), `purpose`, `token_hash` (unique), `expires_at`, `created_at`.

## `questions`

| Column                                        | Type                          | Default     | Meaning                                            |
| --------------------------------------------- | ----------------------------- | ----------- | -------------------------------------------------- |
| `id`                                          | uuid PK                       | uuidv7()    |                                                    |
| `title`                                       | text                          |             | 10–150 chars (check)                               |
| `slug`                                        | text                          |             | unique; never changes                              |
| `description`                                 | text                          | ''          | ≤2000 chars (check)                                |
| `created_by`                                  | uuid FK → users, **set null** |             | the asker                                          |
| `status`                                      | question_status               | 'published' |                                                    |
| `search_vector`                               | tsvector                      | generated   | title (weight A) + description (weight B), English |
| `created_at`                                  | timestamptz                   | now()       |                                                    |
| `for_count`, `neutral_count`, `against_count` | integer                       | 0           | people per side; check ≥ 0                         |

Indexes: unique `slug`; `(status, id desc)`; `questions_active_idx` and `questions_divided_idx` (expression + `id desc nulls first`, partial on published); `(created_by, created_at)`; GIN on `search_vector`; GIN trigram on `title`.

## `user_stances`

`user_id` (FK cascade), `question_id` (FK cascade), `stance`, `updated_at`. PK `(user_id, question_id)`. Index `(question_id, stance)` (used by recounts and the backfill).

## `stance_history`

`id`, `user_id`, `question_id` (both FK cascade), `from_stance` (null on the first declaration), `to_stance`, `changed_at`. Index `(user_id, question_id)`.

## `posts`

| Column             | Type                          | Meaning                                     |
| ------------------ | ----------------------------- | ------------------------------------------- |
| `id`               | uuid PK                       |                                             |
| `question_id`      | uuid FK → questions, cascade  |                                             |
| `author_id`        | uuid FK → users, **set null** | nullable                                    |
| `stance`           | stance                        | the author's stance when posting (snapshot) |
| `title`            | text                          | 5–120 (check)                               |
| `body`             | text                          | Markdown, 30–10,000 (check)                 |
| `helpful_score`    | integer                       | sum of vote weights                         |
| `helpful_count`    | integer                       | number of votes                             |
| `cross_side_count` | integer                       | votes from other stances                    |
| `created_at`       | timestamptz                   |                                             |
| `edited_at`        | timestamptz                   | null = never edited                         |
| `deleted_at`       | timestamptz                   | author's soft delete                        |
| `removed_at`       | timestamptz                   | moderator's removal                         |

Indexes: `posts_column_idx (question_id, stance, id desc) WHERE deleted_at IS NULL AND removed_at IS NULL`; `posts_column_top_idx (question_id, stance, helpful_score desc, id desc)` with the same condition; unique `(author_id, question_id, stance) WHERE deleted_at IS NULL`; `(author_id, created_at)` for the daily limit and spam checks.

## `post_votes`

`user_id` (FK cascade), `post_id` (FK cascade), `voter_stance` (snapshot), `weight` (1/2/3, snapshot), `created_at`. PK `(user_id, post_id)`. Index `post_id`.

## `challenges`

`id`, `post_id` (FK cascade), `created_by` (FK set null), `title` (5–120), `body` (30–5000), `status` (open/removed), `created_at`. Indexes: `(post_id, id desc)`; unique `(created_by, post_id)`; `(created_by, created_at)`.

## `comments`

`id`, `challenge_id` (FK cascade), `parent_id` (FK → comments, cascade; null = top level), `author_id` (FK set null), `body` (1–5000), `depth` (1–50), `created_at`, `deleted_at`, `removed_at`. Indexes: `(challenge_id, parent_id)`, `parent_id`, `(author_id, created_at)`.

The self-reference is written `references((): AnyPgColumn => comments.id)`: the explicit return type breaks TypeScript's circular inference (the table refers to itself while it's being defined).

## `notifications`

`id`, `user_id` (FK cascade), `type`, `actor_id` (FK set null), `challenge_id` (FK cascade), `comment_id` (FK cascade, nullable), `read_at`, `created_at`. Indexes: `(user_id, id desc)`; partial `(user_id) WHERE read_at IS NULL`.

## `reports`

`id`, `reporter_id` (FK cascade; null = automated), `target_type`, `target_id` (no FK), `reason`, `details` (≤1000, default ''), `status` (default open), `resolved_by` (FK set null), `resolved_at`, `created_at`. Indexes: unique `(reporter_id, target_type, target_id)`; partial `(target_type, target_id) WHERE status = 'open'`; `(reporter_id, created_at)`.

## `audit_log`

`id`, `actor_id` (FK set null), `action`, `target_type` (**text**, not the enum: it also holds `'user'` for bans), `target_id` (no FK), `reason` (default ''), `created_at`. Index `(target_type, target_id)`. The app role can't `UPDATE`, `DELETE` or `TRUNCATE` it.

## Drizzle's own table

The migrator records applied migrations in `drizzle.__drizzle_migrations` (a separate `drizzle` schema; that's why the migrator role is granted `CREATE` on the database).
