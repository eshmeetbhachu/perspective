# Relationships and Constraints

## Every foreign key and what happens on delete

| Child column                 | → Parent   | On delete | Reasoning                                                                                                                                                        |
| ---------------------------- | ---------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessions.user_id`           | users      | CASCADE   | personal data                                                                                                                                                    |
| `oauth_accounts.user_id`     | users      | CASCADE   | personal data                                                                                                                                                    |
| `email_tokens.user_id`       | users      | CASCADE   | personal data                                                                                                                                                    |
| `user_stances.user_id`       | users      | CASCADE   | personal data                                                                                                                                                    |
| `stance_history.user_id`     | users      | CASCADE   | personal data                                                                                                                                                    |
| `post_votes.user_id`         | users      | CASCADE   | personal data. **Note:** deleting a user removes their vote rows, but does _not_ subtract their weight from `posts.helpful_score` until `recomputeScores()` runs |
| `notifications.user_id`      | users      | CASCADE   | personal data                                                                                                                                                    |
| `reports.reporter_id`        | users      | CASCADE   | a report without a reporter is meaningless (except automated, which are null from the start)                                                                     |
| `questions.created_by`       | users      | SET NULL  | public content outlives its author                                                                                                                               |
| `posts.author_id`            | users      | SET NULL  | same                                                                                                                                                             |
| `challenges.created_by`      | users      | SET NULL  | same                                                                                                                                                             |
| `comments.author_id`         | users      | SET NULL  | same                                                                                                                                                             |
| `notifications.actor_id`     | users      | SET NULL  | "a deleted account replied"                                                                                                                                      |
| `reports.resolved_by`        | users      | SET NULL  | keep the resolution record                                                                                                                                       |
| `audit_log.actor_id`         | users      | SET NULL  | keep the audit record                                                                                                                                            |
| `user_stances.question_id`   | questions  | CASCADE   |                                                                                                                                                                  |
| `stance_history.question_id` | questions  | CASCADE   |                                                                                                                                                                  |
| `posts.question_id`          | questions  | CASCADE   |                                                                                                                                                                  |
| `post_votes.post_id`         | posts      | CASCADE   |                                                                                                                                                                  |
| `challenges.post_id`         | posts      | CASCADE   | posts are only soft-deleted by the app, so this fires only on a real (admin/test) delete                                                                         |
| `comments.challenge_id`      | challenges | CASCADE   |                                                                                                                                                                  |
| `comments.parent_id`         | comments   | CASCADE   | deleting a comment row deletes its subtree (the app soft-deletes instead)                                                                                        |
| `notifications.challenge_id` | challenges | CASCADE   |                                                                                                                                                                  |
| `notifications.comment_id`   | comments   | CASCADE   |                                                                                                                                                                  |

**Account deletion today:** there's no endpoint for it (see [KNOWN_LIMITATIONS.md](../08_BUGS_AND_DEBUGGING/KNOWN_LIMITATIONS.md)), but the rules above define exactly what _would_ happen, and tests delete users directly to prove that content survives (`questions.test.ts:131`, `posts.test.ts:302`).

**Why cascades instead of application code:** the database applies them atomically with the delete, so nothing can be half-deleted, and no code path can forget a table.

**Test cleanup relies on cascades:** `resetDatabase()` deletes only `reports`, `questions`, `users` and `oauth_pending`. Everything else disappears through cascades (`apps/api/test/helpers.ts`).

## Uniqueness rules

| Rule                                        | Enforced by                                                                | Error surfaced as                  |
| ------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------- |
| One account per email, ignoring capitals    | unique index `lower(email)`                                                | 409 `EMAIL_TAKEN`                  |
| One account per username, ignoring capitals | unique index `lower(username)`                                             | 409 `USERNAME_TAKEN`               |
| A session token maps to one session         | unique `token_hash`                                                        | (practically impossible collision) |
| A Google account links to one user          | PK `(provider, provider_user_id)`                                          | `/account?error=google_conflict`   |
| A user has one Google account               | unique `(user_id, provider)`                                               | same                               |
| Unique slugs                                | unique `slug`                                                              | retry with `-2`…                   |
| One stance per user per question            | PK `(user_id, question_id)`                                                | 409 "Please try again" (race)      |
| One live post per author per side           | partial unique `(author_id, question_id, stance) WHERE deleted_at IS NULL` | 409 `ALREADY_POSTED`               |
| One vote per user per post                  | PK `(user_id, post_id)`                                                    | silently idempotent                |
| One challenge per user per post             | unique `(created_by, post_id)`                                             | 409 `ALREADY_CHALLENGED`           |
| One report per reporter per item            | unique `(reporter_id, target_type, target_id)`                             | silently idempotent                |

**NULLs and unique indexes:** in Postgres, NULLs are _distinct_ by default, so two rows with `reporter_id = null` don't conflict. That's why multiple automated reports on one item are allowed, and why a challenge or post whose author was deleted (author `null`) doesn't block anything.

## Check constraints

| Constraint                                 | Rule                                                    |
| ------------------------------------------ | ------------------------------------------------------- |
| `users_username_format`                    | `username ~ '^[A-Za-z0-9_]{3,20}$'` (`~` = regex match) |
| `questions_title_length`                   | `char_length(title) BETWEEN 10 AND 150`                 |
| `questions_description_length`             | `<= 2000`                                               |
| `questions_stance_counts_positive`         | all three counts `>= 0`                                 |
| `posts_title_length`                       | 5–120                                                   |
| `posts_body_length`                        | 30–10,000                                               |
| `challenges_title_length` / `_body_length` | 5–120 / 30–5,000                                        |
| `comments_body_length`                     | 1–5,000                                                 |
| `comments_depth_range`                     | 1–50                                                    |
| `reports_details_length`                   | ≤1,000                                                  |

`char_length` counts characters, not bytes, so a Hindi or emoji title is measured the way a person reads it.

## Relationships the database can't enforce

| Relationship                                            | Why no FK                                   | How the code copes                                              |
| ------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| `reports.target_id` → four tables                       | an FK names one table                       | `findTarget` returns `null`; the queue shows "no longer exists" |
| `audit_log.target_id` → content or users                | same                                        | the log only displays ids and types                             |
| A comment's parent is in the **same** challenge         | an FK can't compare two columns across rows | checked in `POST /challenges/:id/comments` (`thread.ts:141`)    |
| A post's `stance` equals the author's stance at posting | it's a snapshot, by design                  | set by the server from `user_stances`                           |
| `questions.*_count` equals the count in `user_stances`  | derived data                                | maintained in the same transaction; `recountStances()` rebuilds |
| `posts.helpful_*` equals `post_votes`                   | derived data                                | same; `recomputeScores()` rebuilds                              |
