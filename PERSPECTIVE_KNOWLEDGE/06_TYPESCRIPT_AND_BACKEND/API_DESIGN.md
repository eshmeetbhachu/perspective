# API Design and Complete Endpoint Reference

Verified against every `app.get/post/put/patch/delete` call in `apps/api/src/modules` at commit `cdd117f`: **46 routes** (2 health, 13 auth, 7 questions and stances, 7 posts and votes, 9 challenges/comments/notifications, 8 moderation). In production every path is reached as `/api/<path>` through Vercel.

## Conventions

| Convention     | Rule                                                                                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format         | JSON in, JSON out. Non-JSON bodies are refused (415)                                                                                                                                               |
| Resource style | Nouns in paths (`/questions/:slug/posts`), HTTP verbs for actions; a few action paths where a verb is clearer (`/moderation/post/:id/remove`, `/notifications/read`)                               |
| Ids            | UUIDv7 in paths, validated with `z.uuid()`; questions are addressed by **slug**                                                                                                                    |
| Status codes   | 200 read/update, 201 created, 204 no content, 400 invalid, 401 not logged in, 403 not allowed, 404 not found/not visible, 409 conflict with current state, 429 limit, 500 bug, 503 dependency down |
| Errors         | `{ error: { code, message, details? } }` (D22)                                                                                                                                                     |
| Lists          | `{ items…, nextCursor: string \| null }`; pass `cursor` back for the next page                                                                                                                     |
| Safe methods   | GET never changes data (except internal session renewal); all writes are POST/PUT/PATCH/DELETE (required by the CSRF design)                                                                       |
| Idempotency    | `PUT /…/vote` and `PUT /…/stance` are idempotent; `DELETE /…/vote` too                                                                                                                             |
| Caching        | `Cache-Control: no-store` unless a route sets otherwise                                                                                                                                            |

## Endpoints

Legend: **Auth** — `-` public, `U` logged in, `V` verified email, `M` moderator+. **Limit** — request rate limit (IP-based) and/or daily content limit (per user, Postgres).

### Health

| Method | Path            | Auth | Response                                          |
| ------ | --------------- | ---- | ------------------------------------------------- |
| GET    | `/health`       | -    | `{status:"ok"}` (no DB; exempt from proxy secret) |
| GET    | `/health/ready` | -    | `{status:"ok"}` or 503 `SERVICE_UNAVAILABLE`      |

### Auth

| Method | Path                      | Auth | Limit     | Body / query              | Success                  |
| ------ | ------------------------- | ---- | --------- | ------------------------- | ------------------------ |
| POST   | `/auth/register`          | -    | 5/h       | username, email, password | 201 `{user}` + cookie    |
| POST   | `/auth/login`             | -    | 10/15 min | email, password           | 200 `{user}` + cookie    |
| POST   | `/auth/logout`            | -    | none      | none                      | 204                      |
| GET    | `/auth/me`                | U    | none      | none                      | `{user}`                 |
| GET    | `/auth/providers`         | -    | none      | none                      | `{google}`               |
| GET    | `/auth/google/start`      | -    | 30/15 min | `?intent=login\|link`     | 302 to Google            |
| GET    | `/auth/google/callback`   | -    | 30/15 min | Google's `?code&state`    | 302 to the website       |
| GET    | `/auth/google/pending`    | -    | none      | (cookie)                  | `{email, accountExists}` |
| POST   | `/auth/google/complete`   | -    | 10/h      | username                  | 201 `{user}` + cookie    |
| POST   | `/auth/email/verify/send` | U    | 3/15 min  | none                      | 204                      |
| POST   | `/auth/email/verify`      | -    | 20/15 min | token                     | 204                      |
| POST   | `/auth/password/forgot`   | -    | 5/h       | email                     | 204 always               |
| POST   | `/auth/password/reset`    | -    | 10/h      | token, password           | 200 `{user}` + cookie    |

### Questions and stances

| Method | Path                      | Auth | Limit | Body / query           | Success                              |
| ------ | ------------------------- | ---- | ----- | ---------------------- | ------------------------------------ |
| POST   | `/questions`              | V    | 5/day | title, description?    | 201 `{question}`                     |
| GET    | `/questions`              | -    | none  | sort?, cursor?, limit? | `{questions, nextCursor}`            |
| GET    | `/questions/search`       | -    | none  | q (2–100)              | `{questions, nextCursor:null}` (≤30) |
| GET    | `/questions/similar`      | -    | none  | title (5–150)          | ≤5 questions                         |
| GET    | `/questions/:slug`        | -    | none  | none                   | `{question}`                         |
| GET    | `/questions/:slug/stance` | U    | none  | none                   | `{stance, changeableAt}`             |
| PUT    | `/questions/:slug/stance` | U    | 30/h  | stance                 | `{stance, changeableAt}`             |

### Posts and votes

| Method | Path                     | Auth       | Limit  | Body / query                   | Success                                                   |
| ------ | ------------------------ | ---------- | ------ | ------------------------------ | --------------------------------------------------------- |
| GET    | `/questions/:slug/posts` | -          | none   | stance, sort?, cursor?, limit? | `{posts, nextCursor}`                                     |
| POST   | `/questions/:slug/posts` | V          | 10/day | title, body                    | 201 `{post}`                                              |
| GET    | `/posts/:id`             | -          | none   | none                           | `{post}`                                                  |
| PATCH  | `/posts/:id`             | U (author) | 30/h   | title, body                    | `{post}`                                                  |
| DELETE | `/posts/:id`             | U (author) | none   | none                           | 204                                                       |
| PUT    | `/posts/:id/vote`        | V          | 120/h  | none                           | `{helpfulScore, helpfulCount, crossSideCount, votedByMe}` |
| DELETE | `/posts/:id/vote`        | U          | 120/h  | none                           | same                                                      |

### Challenges, comments, notifications

| Method | Path                          | Auth       | Limit         | Body / query    | Success                              |
| ------ | ----------------------------- | ---------- | ------------- | --------------- | ------------------------------------ |
| POST   | `/posts/:id/challenges`       | V          | 5/day         | title, body     | 201 `{challenge, post, question}`    |
| GET    | `/posts/:id/challenges`       | -          | none          | none            | `{challenges}` (≤50)                 |
| GET    | `/challenges/:id`             | -          | none          | none            | `{challenge, post\|null, question}`  |
| GET    | `/challenges/:id/comments`    | -          | none          | root?           | `{comments}`                         |
| POST   | `/challenges/:id/comments`    | V          | 60/h, 100/day | body, parentId? | 201 `{comment}`                      |
| DELETE | `/comments/:id`               | U (author) | none          | none            | 204                                  |
| GET    | `/notifications/unread-count` | U          | none          | none            | `{unreadCount}`                      |
| GET    | `/notifications`              | U          | none          | none            | `{notifications, unreadCount}` (≤30) |
| POST   | `/notifications/read`         | U          | none          | none            | 204                                  |

### Moderation

| Method | Path                                        | Auth | Limit  | Body                                   | Success            |
| ------ | ------------------------------------------- | ---- | ------ | -------------------------------------- | ------------------ |
| POST   | `/reports`                                  | U    | 20/day | targetType, targetId, reason, details? | 204                |
| GET    | `/moderation/queue`                         | M    | none   | none                                   | `{items}` (≤50)    |
| POST   | `/moderation/:targetType/:targetId/remove`  | M    | none   | reason                                 | 204                |
| POST   | `/moderation/:targetType/:targetId/restore` | M    | none   | reason                                 | 204                |
| POST   | `/moderation/:targetType/:targetId/dismiss` | M    | none   | none                                   | 204                |
| POST   | `/moderation/users/:username/ban`           | M    | none   | reason                                 | 204                |
| POST   | `/moderation/users/:username/unban`         | M    | none   | reason                                 | 204                |
| GET    | `/moderation/audit`                         | M    | none   | none                                   | `{entries}` (≤100) |

## Error codes and where they come from

| Code                            | Status      | Raised by                                                                                      |
| ------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `VALIDATION_FAILED`             | 400         | any Zod schema failure                                                                         |
| `BAD_REQUEST`                   | 400/409/4xx | bad cursors, too-deep replies, slug exhaustion (409), stance race (409), Fastify client errors |
| `INVALID_TOKEN`                 | 400         | email links                                                                                    |
| `UNAUTHENTICATED`               | 401         | `requireUser`                                                                                  |
| `INVALID_CREDENTIALS`           | 401         | login                                                                                          |
| `FORBIDDEN`                     | 403         | CSRF, proxy secret, role, ownership, bans, reporting own content                               |
| `EMAIL_NOT_VERIFIED`            | 403         | `requireVerifiedEmail`                                                                         |
| `ACCOUNT_TOO_NEW`               | 403         | voting                                                                                         |
| `OWN_POST`                      | 403         | voting or challenging your own post                                                            |
| `NOT_FOUND`                     | 404         | missing or invisible content; unknown routes; Google not configured                            |
| `EMAIL_TAKEN`, `USERNAME_TAKEN` | 409         | sign-up, Google completion                                                                     |
| `STANCE_REQUIRED`               | 409         | posting or voting without a stance                                                             |
| `ALREADY_POSTED`                | 409         | second live post on a side                                                                     |
| `ALREADY_CHALLENGED`            | 409         | second challenge on a post                                                                     |
| `DUPLICATE_CONTENT`             | 409         | same text within a day                                                                         |
| `STANCE_COOLDOWN`               | 429         | stance change within 24 h                                                                      |
| `RATE_LIMITED`                  | 429         | rate limits and daily limits                                                                   |
| `INTERNAL_ERROR`                | 500         | unexpected errors                                                                              |
| `SERVICE_UNAVAILABLE`           | 503         | `/health/ready` when the DB is down                                                            |

## Design notes

- **Slugs in URLs for questions, ids for everything else:** questions are shared and indexed by search engines, so readable URLs matter; posts and challenges are reached by clicking.
- **Responses are shaped for the screen that uses them:** e.g. `GET /challenges/:id` returns the challenge, the post (or `null`) and the question's slug and title in one response, so the page needs one request.
- **`votedByMe` is part of the post**, so logged-in pages need no extra "which did I vote for" call. This is also why logged-in responses are never cached.
- **No versioning (`/v1`)**: there is one client, deployed with the API. Versioning would matter if the API were opened to third parties.
- **No pagination on search, notifications and audit:** fixed caps (30/30/100) keep these simple.
