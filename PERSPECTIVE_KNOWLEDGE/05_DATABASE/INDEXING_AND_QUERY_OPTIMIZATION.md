# Indexing and Query Optimization

## How a B-tree index helps

A B-tree keeps keys sorted in a shallow tree of 8 KB pages. Looking up one key, or starting at a position and reading onwards in order, touches only a few pages, even for millions of rows. Two abilities matter most here:

1. **Equality lookups** (`WHERE token_hash = $1`).
2. **Ordered range reads** (`WHERE question_id = $1 AND stance = 'for' ORDER BY id DESC LIMIT 11`): jump to the start position and read 11 entries in index order, with no sorting at all.

The second is why the column order and sort direction of each index match its query exactly.

## Every index and the query it serves

| Index                                                               | Definition                                                                       | Serves                                              |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| `users_email_lower_unique`                                          | unique `(lower(email))`                                                          | login, forgot password, Google matching; uniqueness |
| `users_username_lower_unique`                                       | unique `(lower(username))`                                                       | uniqueness; ban by username                         |
| `sessions_token_hash_unique`                                        | unique `(token_hash)`                                                            | **every request** (`loadSession`)                   |
| `sessions_user_id_idx`                                              | `(user_id)`                                                                      | delete all sessions on ban/reset; cascades          |
| `oauth_accounts` PK                                                 | `(provider, provider_user_id)`                                                   | Google callback lookup by `sub`                     |
| `oauth_accounts_user_provider_unique`                               | unique `(user_id, provider)`                                                     | `googleConnected` EXISTS; one Google per user       |
| `oauth_pending_token_hash_unique`, `email_tokens_token_hash_unique` | unique `(token_hash)`                                                            | consume tokens                                      |
| `email_tokens_user_id_idx`                                          | `(user_id)`                                                                      | delete older links                                  |
| `questions_slug_unique`                                             | unique `(slug)`                                                                  | `/questions/:slug`, every column request            |
| `questions_status_id_idx`                                           | `(status, id DESC)`                                                              | Newest list                                         |
| `questions_active_idx`                                              | `((for+neutral+against) DESC, id DESC NULLS FIRST) WHERE status='published'`     | Most active                                         |
| `questions_divided_idx`                                             | `(least(for, against) DESC, id DESC NULLS FIRST) WHERE status='published'`       | Most divided                                        |
| `questions_created_by_idx`                                          | `(created_by, created_at)`                                                       | 5-per-day limit                                     |
| `questions_search_idx`                                              | GIN `(search_vector)`                                                            | full-text search                                    |
| `questions_title_trgm_idx`                                          | GIN `(title gin_trgm_ops)`                                                       | "did you mean…?"                                    |
| `user_stances` PK                                                   | `(user_id, question_id)`                                                         | find my stance                                      |
| `user_stances_question_idx`                                         | `(question_id, stance)`                                                          | per-question counts (recount, backfill)             |
| `stance_history_user_question_idx`                                  | `(user_id, question_id)`                                                         | future history queries                              |
| `posts_column_idx`                                                  | `(question_id, stance, id DESC) WHERE deleted_at IS NULL AND removed_at IS NULL` | New sort; `postCount`                               |
| `posts_column_top_idx`                                              | `(question_id, stance, helpful_score DESC, id DESC)` same condition              | Top sort                                            |
| `posts_author_question_stance_unique`                               | unique `(author_id, question_id, stance) WHERE deleted_at IS NULL`               | one post per side                                   |
| `posts_author_created_idx`                                          | `(author_id, created_at)`                                                        | 10-per-day limit; duplicate check                   |
| `post_votes` PK / `post_votes_post_idx`                             | `(user_id, post_id)` / `(post_id)`                                               | "did I vote" join; recompute; cascades              |
| `challenges_post_idx`                                               | `(post_id, id DESC)`                                                             | a post's challenges, newest first; `challengeCount` |
| `challenges_creator_post_unique`                                    | unique `(created_by, post_id)`                                                   | one challenge per post                              |
| `challenges_creator_created_idx`                                    | `(created_by, created_at)`                                                       | 5-per-day limit; duplicate check                    |
| `comments_challenge_parent_idx`                                     | `(challenge_id, parent_id)`                                                      | thread anchor (top-level comments)                  |
| `comments_parent_idx`                                               | `(parent_id)`                                                                    | recursive step; `has_more`                          |
| `comments_author_created_idx`                                       | `(author_id, created_at)`                                                        | 100-per-day limit; burst check; duplicates          |
| `notifications_user_idx`                                            | `(user_id, id DESC)`                                                             | notifications list                                  |
| `notifications_unread_idx`                                          | `(user_id) WHERE read_at IS NULL`                                                | unread badge (polled)                               |
| `reports_reporter_target_unique`                                    | unique `(reporter_id, target_type, target_id)`                                   | one report per item                                 |
| `reports_open_idx`                                                  | `(target_type, target_id) WHERE status='open'`                                   | the queue; closing open reports                     |
| `reports_reporter_created_idx`                                      | `(reporter_id, created_at)`                                                      | 20-per-day limit                                    |
| `audit_log_target_idx`                                              | `(target_type, target_id)`                                                       | history for one item                                |

## Kinds of indexes used

- **Composite:** several columns; usable for any _leading prefix_ (`(question_id, stance, id)` serves `WHERE question_id = ? AND stance = ? ORDER BY id DESC`).
- **Expression:** on a computed value (`lower(email)`, `least(...)`). The query must use the identical expression.
- **Partial:** only rows matching a `WHERE`. Smaller, and the planner can use it only when the query's filter implies that condition.
- **Unique:** also a constraint.
- **GIN:** an inverted index for multi-valued data (words in a tsvector, trigrams).

## How to investigate a slow query

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
```

- `ANALYZE` actually runs the query and shows real times and row counts.
- `BUFFERS` shows pages read (`shared hit` = from memory, `read` = from disk).
- Look for `Seq Scan` on big tables, `Sort` nodes (an index didn't provide the order), and big gaps between estimated and actual rows.

To find **which** queries to look at, the lab enables `pg_stat_statements` (`docker-compose.yml`: `shared_preload_libraries=pg_stat_statements`), which records total and average time per query shape.

## The Phase 9 findings (docs/SCALING.md §2)

| Query               | Average    | What the plan showed                                                        | Action             |
| ------------------- | ---------- | --------------------------------------------------------------------------- | ------------------ |
| Search, common word | 10.9 ms    | "cities" matched 16% of questions: whole table read, 7,959 ranked, 30 kept  | none; D72          |
| Search, rare word   | 0.6 ms     | GIN index                                                                   | none               |
| Latest questions    | 1.0 ms     | walks the PK backwards, stops at 21; time is in 21 author lookups           | none               |
| Post column, Top    | 0.5 ms avg | **busiest column read all 337 posts, sorted, kept 11: 3.0 ms, 1,729 pages** | **migration 0010** |
| Post column, Hot    | 1.5 ms     | time-dependent score: whole column read and sorted (5 ms busiest)           | none possible yet  |

**The 0010 lesson (D66):** the index was partial on `deleted_at IS NULL`, but the query also filtered `removed_at IS NULL`. The planner couldn't trust the index to return only matching rows _in order_, so it fetched the whole column and sorted it. Making the index condition identical to the query's filter: **0.4 ms, 95 pages**. Averages barely moved (most columns are small); the worst case, which is the most-viewed questions, improved 7×.

**The 0012 lesson (D74):** `ORDER BY ... DESC` means `NULLS FIRST`; an index on `id DESC NULLS LAST` gives a different order, so the planner added an _Incremental Sort_. Rebuilt `NULLS FIRST`: 3.4 ms → 0.5 ms on 50,000 questions.

## Beyond indexes: what else Phase 9 found

- The single biggest API CPU cost was **Drizzle building SQL text** on every request (22%), not the database. Prepared statements were considered, but the column query has 12 shape variants; caching whole responses removed the query building, the database round trip and the JSON serialisation at once (D67).
- **Measurement noise:** identical runs varied ±50% at p95 on a laptop, so results are medians and each change is judged by the specific number it targets (D65).

## Rules of thumb

1. Index for the queries you run, in the order you filter and sort.
2. Make partial-index conditions match the query's `WHERE` exactly.
3. Match sort direction and NULLS ordering.
4. Prefer keyset pagination so every page is an index range scan.
5. Store derived values that would otherwise need a scan of many rows per request (scores, counts).
6. Measure before and after; `pg_stat_statements` to find, `EXPLAIN (ANALYZE, BUFFERS)` to understand.
