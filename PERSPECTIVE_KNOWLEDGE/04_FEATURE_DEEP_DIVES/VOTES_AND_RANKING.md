# Feature: "Helped Me Understand" Votes and Ranking

**User-facing purpose:** readers mark posts that helped them understand a view. Votes from the other side count more, so the best-ranked posts are the ones that bridge sides, not the ones that please their own side.

## Pieces

| Layer  | Files                                                                                                           |
| ------ | --------------------------------------------------------------------------------------------------------------- |
| UI     | `HelpfulButton.tsx`; the sort bar and badge in `QuestionPage.tsx`, `PostCard.tsx`, `PostPage.tsx`               |
| Hooks  | `posts.ts`: `useVote(slug)`, `useColumn(slug, stance, sort)`                                                    |
| Shared | `posts.ts`: `voteSchema`, `POST_SORTS`, `CROSS_SIDE_BADGE_MIN = 3`; `users.ts`: `VOTING_ACCOUNT_AGE_HOURS = 24` |
| API    | `modules/votes/routes.ts`, `weights.ts`, `scores.ts`; `modules/posts/ranking.ts`                                |
| Tables | `post_votes`, `posts` (score columns), `user_stances`                                                           |

## The weights (D44)

| Voter's stance vs post's stance                 | Weight | Counts as cross-side?                    |
| ----------------------------------------------- | ------ | ---------------------------------------- |
| Same side (For → For)                           | 1      | no                                       |
| Neutral involved (Neutral → For, For → Neutral) | 2      | **yes** (`isCrossSide` = stances differ) |
| Opposite side (For → Against)                   | 3      | yes                                      |

Each post stores three numbers, updated with every vote:

- `helpful_score` = sum of weights (drives **Top** and **Hot**)
- `helpful_count` = number of votes (shown: "12 people found this helpful")
- `cross_side_count` = votes from anyone on a different stance (drives the **Valued across sides** badge at ≥3, D46)

## Who can vote (checked in this order, `votes/routes.ts:31`)

| Check                        | Error                          | Why                                                      |
| ---------------------------- | ------------------------------ | -------------------------------------------------------- |
| Logged in + verified email   | 401 / 403 `EMAIL_NOT_VERIFIED` | throwaway-account resistance                             |
| Account ≥ 24 hours old       | 403 `ACCOUNT_TOO_NEW`          | the cheapest ranking attack: create, vote, discard (D45) |
| Post is live                 | 404                            |                                                          |
| Not your own post            | 403 `OWN_POST`                 |                                                          |
| Has a stance on the question | 409 `STANCE_REQUIRED`          | the weight depends on it (D6)                            |
| Rate limit                   | 429                            | 120 votes/hour (shared by vote and unvote)               |

`HelpfulButton` computes the same reasons in the browser (`blockedReason`) to disable the button and explain why, for example "New accounts can vote from 3 Nov 2026, 14:05".

## Voting is transactional and idempotent

```sql
BEGIN;
INSERT INTO post_votes (user_id, post_id, voter_stance, weight) VALUES ($u, $p, $stance, $w)
  ON CONFLICT DO NOTHING RETURNING weight;
-- only if a row came back:
UPDATE posts SET helpful_score = helpful_score + $w,
                 helpful_count = helpful_count + 1,
                 cross_side_count = cross_side_count + $cross
  WHERE id = $p RETURNING helpful_score, helpful_count, cross_side_count;
-- otherwise just SELECT the counts
COMMIT;
```

- **Atomic:** the vote row and the score change commit together or not at all.
- **Idempotent:** the primary key `(user_id, post_id)` turns a repeated vote (double click, retry) into a no-op; the score can't be counted twice. Test `votes.test.ts:175`.
- **Concurrency-safe:** `helpful_score = helpful_score + 3` is computed by Postgres under the row lock the `UPDATE` takes, so simultaneous votes from different people can't overwrite each other. Test `votes.test.ts:183` ("stays exact under simultaneous votes").

**Unvote** deletes the row `RETURNING weight, voter_stance` and subtracts exactly that, so even if the voter switched sides since, the score returns to precisely what it was (D7, test `:221`).

## Recomputing after a weight change

The stored `voter_stance` and the post's `stance` are the raw facts; the weight is derived. `pnpm recompute-scores` runs `recomputeScores()` (`scores.ts`), in one transaction:

1. `UPDATE post_votes SET weight = CASE ... END FROM posts`, the SQL mirror of `voteWeight()`.
2. `UPDATE posts SET helpful_score = sum(weight), helpful_count = count(*), cross_side_count = count(*) FILTER (WHERE voter_stance <> post.stance)` from a grouped subquery; posts without votes get 0 via `coalesce`.

A test (`votes.test.ts:336`) scrambles the stored numbers, runs it, and checks the rebuilt values, which keeps the SQL and the TypeScript function in agreement.

## The three sorts (D46)

| Sort  | Label in UI  | Order                                                     | Cursor payload            | Index used                           |
| ----- | ------------ | --------------------------------------------------------- | ------------------------- | ------------------------------------ |
| `top` | Most helpful | `helpful_score desc, id desc`                             | `{ id, rank: score }`     | `posts_column_top_idx`               |
| `hot` | Trending     | `hot desc, id desc`, with hot = `score / (hours + 2)^1.5` | `{ id, rank: hot, asOf }` | none possible: value depends on time |
| `new` | Newest       | `id desc`                                                 | `{ id }`                  | `posts_column_idx`                   |

### Hot, explained

```sql
helpful_score / power(greatest(extract(epoch from ($asOf::timestamptz - created_at)) / 3600, 0) + 2, 1.5)
```

- Age in hours (`epoch` seconds / 3600), never negative (`greatest(..., 0)`), plus 2 so a brand-new post isn't divided by zero and doesn't get an infinite boost.
- Raised to the power 1.5: score is divided more and more as the post ages, so older posts sink unless they keep earning votes. A post with score 6 at 1 hour old (6 / 3^1.5 ≈ 1.15) beats a post with score 20 at 24 hours (20 / 26^1.5 ≈ 0.15). Test `votes.test.ts:279`.
- **Why `asOf` is frozen in the cursor:** between page 1 and page 2 the clock moves, so every hot value shrinks slightly and differently; using "now" again could skip or repeat posts. The first page records its time in the cursor, and every later page ranks "as of" that moment (test `:308`).
- **Why no index:** an index stores precomputed values; this value changes every second. It's computed over one column of one question (small), measured at ~1.5 ms average and ~5 ms for the busiest column in the 4.4 M-row lab. D46 notes it would become a stored, periodically refreshed score if measurements called for it.

### Cursors

Base64url-encoded JSON, decoded and validated with Zod (`cursorSchema`). A cursor missing `rank` for top, or `asOf` for hot, or one that isn't valid JSON → 400 "Invalid cursor" (test `:326`). Opaque to the client, which just passes back `nextCursor`. Max 300 characters.

## Frontend: update in place, don't re-sort

`useVote.onSuccess` patches the voted post's counts in `["post", id]` and inside every cached page of `["posts", slug, …]` (`setQueriesData`). The column keeps its order until the next real fetch, so the post the reader just clicked doesn't jump away (D46).

## Known weakness (stated in the roadmap)

Someone can declare a false stance to make their votes count triple for their real side. The cooldown (D8, D43), the 24 h account age (D45) and verified email raise the cost but can't prevent it. It's listed as future work (e.g. weighting by stance history or reputation).

## Tests

`votes.test.ts`: weights, score and cross-side application, who can vote (verified, 24 h, stance, own post, deleted post), repeat votes, simultaneous votes, exact unvote, stance snapshot, `votedByMe`, Top and Hot paging, tampered cursors, recompute. E2E `votes.spec.ts`: vote across sides, earn the badge, re-sort; explain why a reader can't vote.
