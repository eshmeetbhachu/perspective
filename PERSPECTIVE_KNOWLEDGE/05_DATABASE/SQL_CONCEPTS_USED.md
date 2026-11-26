# SQL Concepts Used in Perspective

Each concept with the actual place it's used.

## `RETURNING`

`INSERT/UPDATE/DELETE ... RETURNING cols` gives back the affected rows in the same statement, with no second query.

- `insert(users)...returning(authUserColumns)`: the new user with its generated id.
- `delete(emailTokens)...returning({ userId })`: consume-and-read in one atomic step (single-use links).
- `update(posts)...returning(counts)`: new scores after a vote.

## `ON CONFLICT DO NOTHING`

Try to insert; if a unique/PK constraint would be violated, skip silently. Combined with `RETURNING`, an empty result tells you "it already existed".

- Votes (`post_votes` PK): a repeated vote is a no-op, which makes voting **idempotent**.
- Reports: reporting twice is a no-op.
- First stance declaration: the loser of a race gets nothing back → 409.

## Transactions and `SELECT ... FOR UPDATE`

`FOR UPDATE` locks the selected rows until the transaction ends; other transactions trying to lock or modify them wait.

```sql
BEGIN;
SELECT * FROM user_stances WHERE user_id=$1 AND question_id=$2 FOR UPDATE;
-- check cooldown, update, insert history, move counts
COMMIT;
```

Used in `stances/routes.ts:78`. Postgres's default isolation level is **Read Committed**: each statement sees data committed before it started. The lock is what turns "check, then act" into a safe operation.

## Atomic increments

`SET helpful_score = helpful_score + 3` is evaluated by Postgres on the current row value while holding the row lock. Reading the value into JavaScript, adding, and writing it back would lose concurrent updates. Used for scores (`votes/routes.ts`) and stance counts (`stances/counts.ts`).

## Row-value comparison (keyset pagination)

`(a, b) < (x, y)` is true if `a < x`, or `a = x AND b < y`: lexicographic order, like sorting words. With `ORDER BY a DESC, b DESC`, the rows "after" a cursor are exactly those with `(a, b) < (cursor_a, cursor_b)`.

```sql
WHERE (p.helpful_score, p.id) < ($score::int, $id::uuid)
ORDER BY p.helpful_score DESC, p.id DESC
LIMIT 11
```

Used in `posts/ranking.ts` and `questions/routes.ts:196`. The `id` tiebreaker makes every row's position unique, so equal scores never cause skips or repeats.

## `LIMIT n + 1`

Fetch one more row than the page size; if it arrives, there's a next page. This avoids a separate `COUNT(*)`.

## Correlated subqueries

A subquery that refers to the outer row:

```sql
(SELECT count(*) FROM posts p WHERE p.question_id = q.id AND p.deleted_at IS NULL AND p.removed_at IS NULL)::int
```

Used for `postCount` (questions), `challengeCount` (posts), `commentCount` (challenges), and `EXISTS (SELECT 1 FROM oauth_accounts ...)` for `googleConnected`. `EXISTS` stops at the first match.

## Casts: `::int`, `::text[]`, `::uuid`, `::timestamptz`

`count(*)` returns `bigint`, which the `pg` driver gives to JavaScript as a **string** (a 64-bit integer may not fit exactly in a JS number). `::int` makes it a normal number. `array_agg(enum)::text[]` makes the driver return a real array (see [MODERATION.md](../04_FEATURE_DEEP_DIVES/MODERATION.md)). In raw SQL fragments, parameters are cast (`${cursor.id}::uuid`) so Postgres knows their types.

## `FILTER (WHERE ...)` on aggregates

```sql
count(*) FILTER (WHERE stance = 'for')
```

Counts only matching rows within one `GROUP BY`. Used in migration `0011`, `recountStances()` and `recomputeScores()` to compute three counts in one pass.

## `UPDATE ... FROM`

Update a table using values from another table or subquery (Postgres's form of an update-join). Used in `recomputeScores()`, `recountStances()` and the `0011` backfill. The `FROM questions q2 LEFT JOIN (...) s` pattern ensures questions with **no** stances are reset to 0 via `coalesce`.

## `coalesce(a, b)`

The first non-null value. `email_verified_at = coalesce(email_verified_at, now())` keeps the original verification time if there is one.

## `GROUP BY` + aggregates

`count(*)`, `max(created_at)`, `array_agg(DISTINCT reason)`, `array_remove(array_agg(details), '')` in the moderation queue.

## Recursive CTEs (`WITH RECURSIVE`)

A **common table expression** names a subquery; a **recursive** one refers to itself to walk hierarchies. The anchor part runs once; the recursive part repeats, each time using the rows produced by the previous step, until it produces none (or a depth limit). Used for comment threads (`challenges/thread.ts:61`), with `ARRAY[c.id]` and `path || c.id` building a path that `ORDER BY path` sorts depth-first. Fully explained in [CHALLENGES_AND_THREADS.md](../04_FEATURE_DEEP_DIVES/CHALLENGES_AND_THREADS.md).

## Generated columns

`GENERATED ALWAYS AS (expression) STORED`: Postgres computes and stores the value on insert and update (`questions.search_vector`).

## Full-text search operators

`to_tsvector`, `setweight`, `websearch_to_tsquery`, `@@` (matches), `ts_rank`. See [SEARCH_AND_SUGGESTIONS.md](../04_FEATURE_DEEP_DIVES/SEARCH_AND_SUGGESTIONS.md).

## Trigram operators (`pg_trgm`)

`%` (similar enough), `similarity(a, b)` (0–1).

## Date and time arithmetic

- `now() - interval '1 day'`: daily limits.
- `make_interval(mins => $1)`: a parameterised interval (comment burst check), safer than building `'10 minutes'` as a string.
- `extract(epoch FROM (t1 - t2)) / 3600`: hours between two timestamps (hot score).
- `power(x, 1.5)`, `greatest(x, 0)`, `least(a, b)`.

## Expression indexes and partial indexes

Index on `lower(email)`, on `(for_count + neutral_count + against_count)`, on `least(for_count, against_count)`; partial `WHERE deleted_at IS NULL AND removed_at IS NULL`, `WHERE read_at IS NULL`, `WHERE status = 'open'`. See [INDEXING_AND_QUERY_OPTIMIZATION.md](INDEXING_AND_QUERY_OPTIMIZATION.md).

## Regular expressions in SQL

`username ~ '^[A-Za-z0-9_]{3,20}$'` (check constraint); `regexp_replace(trim(body), '\s+', ' ', 'g')` (spam normalisation).

## Advisory locks

`pg_advisory_lock(n)`: an application-defined lock on a number (migrations). See [MIGRATIONS_EXPLAINED.md](MIGRATIONS_EXPLAINED.md).

## Write-ahead log positions (lab)

`pg_current_wal_lsn()` on the primary and `pg_last_wal_replay_lsn()` on the replica return byte positions in the WAL (the log every change is written to before it's applied). Subtracting `'0/0'` turns an LSN into a number that can be compared (`cache.ts:64`, `:92`). Used for read-your-writes ([SCALING_AND_INFRASTRUCTURE_EXPERIMENTS.md](../09_TESTING_AND_DEPLOYMENT/SCALING_AND_INFRASTRUCTURE_EXPERIMENTS.md)).

## Parameterised queries (SQL-injection safety)

Every value reaches Postgres as a parameter (`$1`, `$2`). Drizzle's `sql\`... ${value}\``template inserts **parameters**, not text. Identifiers that must be text (the database name in`setup-roles.ts`) use `client.escapeIdentifier`, and passwords use `client.escapeLiteral`; in the init script psql variables use `:'name'` quoting.
