# Feature: Questions

**User-facing purpose:** every discussion starts as a question that can be answered For, Neutral or Against. People ask questions, browse them sorted three ways, and open one to see its three columns.

## Pieces

| Layer      | Files                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Pages      | `AskPage.tsx` (`/ask`), `QuestionsPage.tsx` (`/questions`), `QuestionPage.tsx` (`/q/:slug`), `HomePage.tsx` (featured)    |
| Components | `QuestionCard.tsx` (row/tile), `StanceBar.tsx` (`StanceBar`, `StanceSummary`)                                             |
| Hooks      | `questions.ts`: `useAskQuestion`, `useQuestionList`, `useFeaturedQuestions`, `useQuestion`                                |
| Shared     | `packages/shared/src/questions.ts`: `createQuestionSchema`, `questionSchema`, `QUESTION_SORTS`, `questionListQuerySchema` |
| API        | `modules/questions/routes.ts`, `find.ts`, `slugs.ts`; `modules/stances/counts.ts`                                         |
| Tables     | `questions` (+ `users` for the author name, `posts` for the post count)                                                   |

## Endpoints

| Route                                         | Guard / cache                                              | Notes                                                               |
| --------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| `POST /questions`                             | `requireVerifiedEmail`                                     | 5 per day (counted in Postgres); returns 201 `{ question }`         |
| `GET /questions?sort=&cursor=&limit=`         | public; lab cache `questionListCache` (60 s)               | `sort` = new (default) / active / divided; `limit` 1–50, default 20 |
| `GET /questions/:slug`                        | public; lab cache `questionCache` (10 min)                 | 404 if missing or removed                                           |
| `GET /questions/search`, `/questions/similar` | see [SEARCH_AND_SUGGESTIONS.md](SEARCH_AND_SUGGESTIONS.md) |                                                                     |

## What a question looks like on the wire

```json
{
  "id": "01a181a6-32f4-7e2a-ad4d-6d51d69328d2",
  "slug": "should-cities-ban-cars-downtown",
  "title": "Should cities ban cars downtown?",
  "description": "",
  "createdAt": "2026-10-28T08:35:15.316Z",
  "author": { "username": "sam" },
  "stanceCounts": { "for": 12, "neutral": 3, "against": 9 },
  "postCount": 7
}
```

`author` is `null` if the asker's account was deleted (`on delete set null`, D37: questions outlive their author).

## Asking a question

**Validation** (shared): `questionTitleSchema` trims, collapses repeated whitespace, then requires 10–150 characters **ending in `?`** ("Phrase it as a question ending with ?"). Description: optional, trimmed, ≤2000. The database repeats both length rules as `check` constraints.

**Handler** (`questions/routes.ts:143`):

1. `requireUser` → user.
2. Daily limit: `count(*) where created_by = $u and created_at > now() - interval '1 day'` ≥ 5 → 429. Index `questions_created_by_idx (created_by, created_at)` makes this a tiny range scan. **Why in Postgres, not memory:** it must hold across restarts and across several API instances.
3. `insertWithUniqueSlug` (see [IMPORTANT_FUNCTIONS](../02_CODEBASE/IMPORTANT_FUNCTIONS_AND_MODULES.md#insertwithuniqueslugvalues-appsapisrcmodulesquestionsroutests110)): try `slug`, `slug-2`, … `slug-10`.
4. Re-select with the standard columns, `bumpCache("questions")`, 201.

**Frontend** (`AskPage.tsx`): unverified users see "Verify your email first" with a resend button instead of the form. While typing, `useSimilarQuestions(title)` (debounced 400 ms) shows "Did you mean one of these?". On success the new question is put in the cache under `["question", slug]` and the app navigates to `/q/<slug>`, so the page renders without another request.

**Status:** new questions get the column default `published` (D37). The enum also has `pending` (never used yet, ready for a review-first mode) and `removed` (set by moderators).

## Slugs (D40)

`slugify` keeps letters of every script, drops only Latin accents, cuts at 80 characters on a word boundary, and **never changes** afterwards (even if moderation or editing were added), so shared links keep working. Uniqueness comes from the `questions_slug_unique` index, which also serves the lookup `where slug = $1`.

Examples:

| Title                            | Slug                              |
| -------------------------------- | --------------------------------- |
| `Should voting be mandatory?`    | `should-voting-be-mandatory`      |
| `Café culture: good for cities?` | `cafe-culture-good-for-cities`    |
| Same title again                 | `should-voting-be-mandatory-2`    |
| A Hindi title                    | Devanagari letters kept, readable |

## Listing and sorting (D38, D74)

| Sort      | Meaning                                      | ORDER BY                              | Index                                                     | Cursor           |
| --------- | -------------------------------------------- | ------------------------------------- | --------------------------------------------------------- | ---------------- |
| `new`     | newest first                                 | `id desc` (UUIDv7 = time order)       | `questions_status_id_idx (status, id desc)`               | last `id`        |
| `active`  | most people with a stance                    | `(for+neutral+against) desc, id desc` | `questions_active_idx` (expression, partial on published) | `"<total>:<id>"` |
| `divided` | biggest smaller side between For and Against | `least(for, against) desc, id desc`   | `questions_divided_idx`                                   | `"<min>:<id>"`   |

**"Most divided" explained:** a question with 100 For and 2 Against isn't divided; one with 40 For and 38 Against is. `least(for, against)` is large only when _both_ sides are large. Neutral doesn't count towards division.

**Paging:** fetch `limit + 1` rows; if there are more than `limit`, the last returned row becomes the cursor. For ranked sorts the condition is a **row comparison**: `(rank_expression, id) < (cursorValue, cursorId)`. The cursor is checked against the regex `^\d{1,10}:[0-9a-f-]{36}$` (or `z.uuid()` for `new`) before use. A cursor from one sort used with another, or a tampered one, gets 400 "That page link is no longer valid" (test `question-counts.test.ts:175`).

**Why the rank SQL is written exactly like the index expression** (`ranks` object, `routes.ts:79`): Postgres only uses an expression index if the query contains the _same_ expression. Writing `(for_count + neutral_count + against_count)` in the same order makes the index usable.

## Stance counts and post count

- `for_count`, `neutral_count`, `against_count` live on `questions` and are updated by `moveStanceCount` inside every stance transaction ([STANCES.md](STANCES.md)).
- `postCount` is counted live with a correlated subquery that the partial index `posts_column_idx` answers quickly (D74: "post counts are counted live").
- **The frontend** turns counts into whole percentages that always add up to 100 (`sharesOf` in `StanceBar.tsx`: For and Neutral are rounded, Against gets the remainder). Otherwise 33.3/33.3/33.3 would show as 33+33+33 = 99.

## Lab caching

The list and search use `questionListCache` (scopes `questions` and `moderation`, TTL 60 s). Stance counts change too often to invalidate the list on every stance, so a minute of staleness is accepted for logged-out visitors (D74). One question uses `questionCache` (scope `question:<slug>`, TTL 10 min), invalidated by posts, votes, challenges and stances on that question. Logged-in readers bypass the cache, so the person who just took a side sees it immediately.

## Edge cases

| Case                        | Result                                                |
| --------------------------- | ----------------------------------------------------- |
| Title without `?`           | 400 with the field message                            |
| 11 identical titles         | 409 "Too many questions share this title"             |
| Removed question            | 404 everywhere; disappears from lists                 |
| Asker deletes their account | Question stays, shown as "Asked by a deleted account" |
| Concurrent identical titles | Unique index decides; the loser retries with `-2`     |

## Tests

`questions.test.ts` (asking, slugs, limits, browsing without gaps or repeats, removed questions, search, similar, slugify) and `question-counts.test.ts` (counts on declare/change/repeat, live post count, active/divided order, ranked paging, cross-sort cursor rejection). E2E: `questions.spec.ts`.
