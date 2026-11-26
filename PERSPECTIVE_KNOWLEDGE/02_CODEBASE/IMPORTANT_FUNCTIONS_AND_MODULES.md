# Important Functions and Modules

The functions you most need to understand, with inputs, outputs, execution order, side effects, errors and TypeScript notes. Line numbers are at commit `cdd117f`.

---

## `loadEnv()` / `env`: `apps/api/src/config/env.ts:68`

- **Input:** `process.env` (all strings).
- **Output:** `env`, a typed object (`Env = z.infer<typeof EnvSchema>`), e.g. `env.PORT` is a `number`.
- **Steps:** drop empty strings (so `GOOGLE_CLIENT_ID=` means "not set") → `EnvSchema.safeParse` → on failure print `z.prettifyError` and `process.exit(1)`.
- **Side effects:** runs once, at import time (`export const env = loadEnv()`), so every module that imports `env` gets the same validated object.
- **TypeScript:** `z.coerce.number()` converts `"3000"` to `3000`; `.transform((url) => new URL(url).origin)` normalises `WEB_ORIGIN`, so `https://site.app/` becomes `https://site.app` (a real bug that this prevents: a trailing slash would break every Origin comparison, D61).
- **If removed:** every module would read raw strings, and a missing variable would surface as a confusing crash deep inside a request.

---

## `buildApp()`: `apps/api/src/app.ts:34`

- **Output:** `Promise<FastifyInstance>`, a fully configured app that is **not listening**.
- **Steps:** see the table in [BACKEND_ARCHITECTURE.md](../01_ARCHITECTURE/BACKEND_ARCHITECTURE.md#plugins-and-hooks-registered-in-buildapp).
- **Used by:** `server.ts` and every API test (`app.inject()`).
- **Why `async` and `await app.register(...)`:** Fastify plugins load asynchronously; awaiting each one makes errors surface at startup in a predictable order.

---

## `loadSession(request, reply)`: `apps/api/src/plugins/auth.ts:20`

- **Runs:** as an `onRequest` hook, on every request.
- **Input:** the `session` cookie.
- **Steps:** no cookie → return. `validateSession(token)`: null → `clearSessionCookie` (the browser holds a dead token). Otherwise set `request.user` and `request.sessionId`; if renewed, re-send the cookie with the new expiry.
- **Database:** one `select` joining `sessions` and `users` on `token_hash` (unique index); sometimes an `update` (renewal) or `delete` (expired or banned).
- **Errors:** never throws for a bad cookie; anonymous is a valid state. Guards decide later whether anonymous is allowed.

## `validateSession(token)`: `apps/api/src/modules/auth/sessions.ts:53`

- **Output:** `{ sessionId, user: AuthUser, renewedUntil: Date | null } | null`.
- **Rules:** unknown → null; `expires_at <= now` **or** `user.banned_at` set → delete the row, return null; less than 15 days left → extend to now + 30 days.
- **TypeScript:** `AuthUser = Omit<typeof users.$inferSelect, "passwordHash"> & { googleConnected: boolean }`, a type built from the table definition, minus the hash, plus one computed field. `authUserColumns` includes `googleConnected: sql<boolean>\`exists (...)\``, a subquery typed with a generic.

## `startSession(request, reply, userId)`: `sessions.ts:93`

- **Side effects:** deletes the previous session row (if the request had one), inserts a new one, sets the cookie.
- **Called by:** register, login, Google callback/complete, password reset.
- **Why delete first:** session-fixation defence (see [AUTHENTICATION_ARCHITECTURE.md](../01_ARCHITECTURE/AUTHENTICATION_ARCHITECTURE.md)).

---

## `errorHandler(error, request, reply)`: `apps/api/src/plugins/error-handler.ts:18`

Four branches (`AppError` → validation → other 4xx → 500). Returns `FastifyReply`. Covered in [VALIDATION_AND_ERROR_HANDLING.md](../06_TYPESCRIPT_AND_BACKEND/VALIDATION_AND_ERROR_HANDLING.md).

## `uniqueViolation(err)`: `apps/api/src/db/errors.ts:3`

- **Input:** `unknown` (whatever was thrown).
- **Output:** the constraint name, or `undefined`.
- **TypeScript lesson:** `err` is `unknown`, so the code _narrows_ it step by step: `err instanceof Error` → `typeof cause === "object" && cause !== null` → `"code" in cause` → `cause.code === "23505"` → `"constraint" in cause && typeof cause.constraint === "string"`. After each check TypeScript knows more about the value. This is the safe way to inspect errors without `any`.
- **Callers:** `insertUser` (email/username taken), `insertWithUniqueSlug` (try `-2`, `-3`…), post creation (`ALREADY_POSTED`), challenge creation (`ALREADY_CHALLENGED`), `linkGoogle` (already linked).

---

## `insertWithUniqueSlug(values)`: `apps/api/src/modules/questions/routes.ts:110`

- **Steps:** `base = slugify(title)`; try `base`, then `base-2` … `base-10`; on `questions_slug_unique` violation try the next; any other error is rethrown; after 10 failures → 409.
- **Why let the database decide** instead of `select` first? Two simultaneous inserts could both "see" the slug as free; the unique index is the only thing that settles the race (D40).

## `slugify(title)`: `apps/api/src/modules/questions/slugs.ts:5`

`normalize("NFKD")` splits "é" into "e" + a combining accent; the regex `[̀-ͯ]` removes Latin combining accents only; `normalize("NFC")` recombines the rest (so Devanagari vowel signs survive); `[^\p{L}\p{M}\p{N}]+` → `-` keeps letters, marks and digits of **every script** (the `u` flag enables `\p{...}` Unicode classes). Cut at 80 characters on a word boundary; an empty result becomes `"question"`.

---

## `rankPosts(sort, cursorValue?)`: `apps/api/src/modules/posts/ranking.ts:48`

- **Output:** `{ rank, orderBy, after, nextCursor }`, everything the column query needs for that sort.
- **Cursor format:** base64url of JSON `{ id, rank?, asOf? }`, decoded and validated with Zod; a tampered cursor → 400.
- **Per sort:**
  - `new`: order by `id desc`; after = `id < cursor.id`.
  - `top`: order by `(helpful_score desc, id desc)`; after = row comparison `(helpful_score, id) < (rank, id)`.
  - `hot`: `helpful_score / (hours_since_posted + 2)^1.5` computed **as of** a timestamp fixed in the first page's cursor, so later pages rank with the same clock (D46).
- **Why row comparison `(a, b) < (x, y)`:** it means "a < x, or a = x and b < y", exactly "comes after this item in descending order". Explained in [SQL_CONCEPTS_USED.md](../05_DATABASE/SQL_CONCEPTS_USED.md).

## `selectPosts(viewerId, rank, reader)`: `apps/api/src/modules/posts/queries.ts:63`

Joins `posts → questions → users`, and **left joins `post_votes` only for the viewer** (`viewerId ? eq(postVotes.userId, viewerId) : sql\`false\``). Every post then carries `votedByMe`without a second query.`challengeCount` is a correlated subquery counting open challenges.

## `live`: `queries.ts:84`

`deleted_at is null and removed_at is null and questions.status = 'published'`. Every read of posts uses this one definition, so "visible" means the same thing everywhere.

---

## `voteWeight(voter, post)`: `apps/api/src/modules/votes/weights.ts:4`

```ts
if (voter === post) return 1;
if (voter === "neutral" || post === "neutral") return 2;
return 3;
```

The SQL `CASE` in `recomputeScores()` mirrors it, and a test (`votes.test.ts:336`) keeps the two in agreement.

---

## `moveStanceCount(tx, questionId, from, to)`: `apps/api/src/modules/stances/counts.ts:12`

`delta(side) = (side === to ? 1 : 0) - (side === from ? 1 : 0)`, applied to all three columns in one `UPDATE ... SET for_count = for_count + $1, ...`. Must be called with the **transaction** (`tx`), so the counts commit or roll back together with the stance.

---

## `loadThread(challengeId, rootId?)`: `apps/api/src/modules/challenges/thread.ts:58`

A `WITH RECURSIVE` query: start at top-level comments (or one comment), add children level by level up to `THREAD_PAGE_DEPTH` (5), carry `path = array[ids…]`, `order by path` for depth-first order, mark `has_more` at the last level when replies exist below, cap at 1,000 rows. Explained in [CHALLENGES_AND_THREADS.md](../04_FEATURE_DEEP_DIVES/CHALLENGES_AND_THREADS.md).

## `notify(tx, values)`: `apps/api/src/modules/notifications/notify.ts:9`

Skips when the recipient is `null` (deleted account) or the recipient is the actor. Always runs inside the caller's transaction (D49).

---

## `rejectDuplicate(tx, type, item)` / `flagIfSuspicious(tx, item)`: `apps/api/src/modules/moderation/spam.ts`

- `rejectDuplicate`: after the insert, inside the transaction, look for another live item by the same author in the last day whose **normalized** body (trimmed, lower-cased, whitespace collapsed) matches → 409 `DUPLICATE_CONTENT`, which rolls back the insert. Why after the insert? So more specific errors (e.g. the unique "already posted on this side") win (D51).
- `flagIfSuspicious`: ≥3 `http(s)://` links from an account <3 days old, or (for comments) ≥10 comments in 10 minutes → insert an `automated` report. Nothing is blocked.

## `findTarget(type, id)` / `setRemoved(tx, type, id, removed)`: `apps/api/src/modules/moderation/targets.ts`

One `switch` on the four target types gives the moderation code a uniform view (`title`, `excerpt`, `link`, `removed`, `visible`) and a uniform way to hide or restore. TypeScript checks that `findTarget`'s `switch` handles every `ReportTarget`: the declared return type is `Promise<Target | null>`, so if a case were missing, the end of the function would be reachable without a `return`, and the compiler reports "Function lacks ending return statement".

---

## `bumpCache(log, ...scopes)` / `serveFromCache` / `storeInCache` / `readerFor`: `apps/api/src/cache.ts`

The Phase 9 cache and replica router. All are no-ops without Redis. Explained in [SCALING_AND_INFRASTRUCTURE_EXPERIMENTS.md](../09_TESTING_AND_DEPLOYMENT/SCALING_AND_INFRASTRUCTURE_EXPERIMENTS.md).

## `sendEmail(email, log)` / `deliverEmail(email, log)`: `apps/api/src/mailer.ts:43`, `:58`

`sendEmail` tries the BullMQ queue (if Redis) and falls back to `deliverEmail`. `deliverEmail` logs the email (masked recipient, full text with the link) when there's no SMTP transport, or sends it with nodemailer. In tests the transport is always `null`.

---

## Frontend: `api<T>()`: `apps/web/src/api.ts:48`

Generic `T` is the expected response type: `api<UserResponse>("/auth/me")` returns `Promise<UserResponse>`. **Note:** this is a _type assertion_ (`as T`); nothing checks at runtime that the server sent that shape. That's acceptable because the server validates its own responses with the same shared schemas.

## Frontend: `useVote(slug)`: `apps/web/src/posts.ts:101`

On success, `setQueryData` for the single post and `setQueriesData` (plural: every matching key) for all cached column pages of that question, replacing just the counts of the voted post. `InfiniteData<PostListResponse>` is TanStack's type for `{ pages: Page[], pageParams: unknown[] }`.

## Frontend: `renderMarkdown(source)`: `apps/web/src/markdown.ts:32`

`marked.parse(source, { async: false, gfm: true, breaks: true })` → `DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: ["href", "title"] })`. The `afterSanitizeAttributes` hook rewrites every `<a>`. DOMPurify also drops `javascript:` URLs by default (tested).

## Frontend: `buildTree(comments)`: `apps/web/src/components/Thread.tsx:18`

One pass over the depth-first list with a `Map<id, Node>`: each comment is attached to its parent if the parent has been seen, otherwise it becomes a root. This works because the API guarantees parents come before children (`order by path`).
