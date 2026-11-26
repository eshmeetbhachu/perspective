# Feature: Challenges and Threaded Discussions

**User-facing purpose:** if you disagree with a post, you don't comment under it; you **challenge** it. Each challenge has its own page with a threaded discussion. This keeps the columns calm and puts debate in one place per disagreement.

## Pieces

| Layer      | Files                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pages      | `NewChallengePage.tsx` (`/posts/:id/challenge`), `ChallengePage.tsx` (`/c/:id?root=`), `PostPage.tsx` (list)                                                                   |
| Components | `Thread.tsx` (`buildTree`, `CommentNode`, `ReplyForm`)                                                                                                                         |
| Hooks      | `challenges.ts`: `usePostChallenges`, `useChallenge`, `useThread`, `useCreateChallenge`, `useReply`, `useDeleteComment`                                                        |
| Shared     | `challenges.ts`: `createChallengeSchema` (title 5–120, body 30–5,000), `createCommentSchema` (1–5,000, optional `parentId`), `THREAD_PAGE_DEPTH = 5`, `MAX_COMMENT_DEPTH = 50` |
| API        | `modules/challenges/routes.ts`, `thread.ts`; `notifications/notify.ts`; `moderation/spam.ts`                                                                                   |
| Tables     | `challenges`, `comments`, `notifications`, plus `posts`, `questions`, `users`, `user_stances`                                                                                  |

## Endpoints

| Route                                | Guard                  | Limits                         | Result                                                   |
| ------------------------------------ | ---------------------- | ------------------------------ | -------------------------------------------------------- |
| `POST /posts/:id/challenges`         | `requireVerifiedEmail` | 5/day; one per person per post | 201: the full challenge page payload                     |
| `GET /posts/:id/challenges`          | public                 | newest 50                      | `{ challenges }`                                         |
| `GET /challenges/:id`                | public                 | none                           | `{ challenge, post \| null, question: { slug, title } }` |
| `GET /challenges/:id/comments?root=` | public                 | ≤1,000 rows                    | `{ comments }` in depth-first order                      |
| `POST /challenges/:id/comments`      | `requireVerifiedEmail` | 60/hour; 100/day               | 201 `{ comment }`                                        |
| `DELETE /comments/:id`               | author only            | none                           | 204 (soft delete)                                        |

## Challenge rules (D47)

- You can't challenge your own post (403 `OWN_POST`).
- **One challenge per person per post** (unique index `(created_by, post_id)` → 409 `ALREADY_CHALLENGED`, "Continue in its thread"). Follow-ups go into the existing thread instead of starting parallel ones.
- The challenger's stance on the question (if any) is shown next to their name ("stands against"). It comes from a left join with `user_stances`, so you don't need a stance to challenge.
- **Visible** = challenge `open` and question `published`, even if the post was deleted (D15). Then `post` is `null` and the page says "The author deleted this post".
- Creating a challenge notifies the post's author (`post_challenged`), runs the spam checks, and bumps the question's cache (columns show challenge counts), all in or right after one transaction.

## Comments: an adjacency list (D11)

Each comment row has `parent_id` (null for top-level) and a stored `depth` (1 for top-level, parent + 1 for replies). Rules when replying (`thread.ts:138`):

- The parent must exist, belong to **this** challenge, and be neither deleted nor removed → otherwise 404. (Test `:299`: you can't attach a reply to a comment in another challenge.)
- `parent.depth >= 50` → 400 "This thread is too deep to reply to". The database also has `check (depth between 1 and 50)`.
- Notification: a reply notifies the parent comment's author; a top-level comment notifies the challenger (`comment_reply`).

## Loading a thread: one recursive query (D48)

```sql
WITH RECURSIVE thread AS (
  -- anchor: the starting rows
  SELECT c.*, 1 AS level, ARRAY[c.id] AS path
  FROM comments c
  WHERE c.challenge_id = $challenge AND c.parent_id IS NULL      -- or: c.id = $root
  UNION ALL
  -- recursive step: children of rows found so far
  SELECT c.*, t.level + 1, t.path || c.id
  FROM comments c JOIN thread t ON c.parent_id = t.id
  WHERE t.level < 5
)
SELECT t.id, t.parent_id, t.body, t.depth, t.created_at, t.deleted_at, t.removed_at, u.username,
       (t.level = 5 AND EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = t.id)) AS has_more
FROM thread t LEFT JOIN users u ON u.id = t.author_id
ORDER BY t.path
LIMIT 1000
```

How to read it:

1. The **anchor** finds the top-level comments (or, for "Continue this thread", the one comment in `?root=`).
2. The **recursive step** repeatedly adds the children of everything found so far, until 5 levels have been loaded.
3. `path` is the array of ids from the start down to each comment. Sorting by `path` gives **depth-first order**: each comment is followed immediately by its replies. Because ids are UUIDv7, siblings come out oldest first.
4. `has_more` marks comments at the 5th level that have replies below, where the UI shows "Continue this thread →".
5. `LIMIT 1000` bounds the work for huge threads.

**Why 5 levels per page:** deep nesting becomes unreadable, especially on phones (each level indents). "Continue this thread" opens the deeper branch as its own page (`/c/:id?root=<comment>`), which runs the same query from that comment.

**Why one query:** however the thread is shaped, a page costs one database round trip, instead of one query per level (the "N+1 queries" problem).

## Rebuilding the tree in the browser

The API returns a flat, depth-first list. `buildTree` (`Thread.tsx:18`) walks it once with a `Map`: each comment is attached to its parent if the parent is already in the map, otherwise it becomes a root. The root of a "continue" page has a parent that isn't in the list, so it naturally becomes the root.

## Deleted and removed comments stay as placeholders

`toComment` (`thread.ts:37`) blanks the body and author of deleted or removed comments, and the UI shows `[deleted]` or `[removed by a moderator]`. The row stays so its replies keep their place in the tree (test `:319`). Deleting is soft (`deleted_at`); there's no edit (D48).

## Notifications and transactions (D49)

Challenge creation and comment creation call `notify(tx, …)` **inside** their transaction. If the insert is rolled back (for example by the duplicate-text check), the notification disappears with it, and a notification can never point at a challenge or comment that doesn't exist.

## Frontend behaviour

- Verified users see the `ReplyForm` at the top of the discussion and a "Reply" link under each comment; others see "Verify your email…" or "Log in to join".
- After replying or deleting, the hooks invalidate `["thread", id]` and `["challenge", id]` (for the count).
- Links like `/c/<id>#comment-<commentId>` (used in notifications and moderation previews) scroll to the comment after the thread loads (`Thread.tsx:215`).

## Not cached

Challenge pages and threads are not in the Phase 9 cache (only the question list, search, question and columns are). Deleting a comment therefore needs no cache bump.

## Tests

`challenges.test.ts`: creating + notifying, one per person, no self-challenge, verification required, list order, readable after post deletion, removed challenges hidden; threads depth-first with the right notifications, 5-level pages and continuation, depth limit, same-challenge parents, placeholders; notifications marked read and private. E2E `challenges.spec.ts`: challenge → notification → thread; deep threads continue on their own page.
