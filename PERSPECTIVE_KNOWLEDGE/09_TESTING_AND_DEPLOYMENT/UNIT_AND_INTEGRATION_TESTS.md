# Unit and Integration Tests

## How an API test looks

```ts
// shape of apps/api/test/auth.test.ts (simplified)
let app: FastifyInstance;
beforeEach(async () => {
  await resetDatabase();
  app = await buildApp(); // a fresh app per test
});
afterEach(async () => {
  await app.close();
});

it("logs in with the right password", async () => {
  await register(app, {
    email: "sam@example.com",
    password: "a long password",
  });
  const response = await post(app, "/auth/login", {
    email: "sam@example.com",
    password: "a long password",
  });
  expect(response.statusCode).toBe(200);
  expect(sessionCookie(response)).toBeDefined();
});
```

Helpers (`test/helpers.ts`): `post(app, url, payload, session?)` always sends `Origin: WEB_ORIGIN` (otherwise the CSRF hook would refuse it); `get(app, url, session?)`; `register`; `sessionCookie`, `findCookie`. Many files define small local helpers (e.g. `person(name, role)` that creates a verified, aged user and session).

## What each file proves

| File                      | Area                               | Highlights                                                                                                                                                                                                                                                      |
| ------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.test.ts`            | sign-up, login, sessions, CSRF     | hashes stored not secrets; capitals; equal answers; session replaced; banned; expiry; renewal; cross-site blocked; non-JSON refused                                                                                                                             |
| `email.test.ts`           | verification, reset                | single use; expiry; older links invalidated; same answer for unknown emails; reset logs out others; passwordless accounts; banned get nothing; masking                                                                                                          |
| `email-queue.test.ts`     | BullMQ (needs Redis)               | queued with retries; falls back to sending now when the queue is unreachable                                                                                                                                                                                    |
| `google.test.ts`          | OIDC flows                         | new users; linked logins; D27 cases; account-page linking; conflicts; unverified; missing state; failed verification; suspended                                                                                                                                 |
| `guards.test.ts`          | roles                              | anonymous/user/mod/admin on test routes; role read per request; verified-email guard                                                                                                                                                                            |
| `questions.test.ts`       | questions                          | slugs; verification; question mark; repeated titles; 5/day; survives author deletion; paging without gaps; removed hidden; 404; search; similar; slugify                                                                                                        |
| `question-counts.test.ts` | stance counts and sorts            | counts per side; moving sides; no-op repeats; live post counts; active/divided order; ranked paging; cross-sort cursor rejected                                                                                                                                 |
| `posts.test.ts`           | stances and posts                  | cooldown; same-stance no-op; **concurrent changes**; stance read; posts need verification + stance; column placement; one per side; length; 10/day; author-only edit/delete; soft delete; survives account deletion; paging; disappear with question            |
| `votes.test.ts`           | votes and ranking                  | weights; score + cross-side; verified/24 h/stance/own/deleted rules; repeat vote; **simultaneous votes**; exact unvote; stance snapshot; `votedByMe`; Top/Hot paging; tampered cursors; recompute                                                               |
| `challenges.test.ts`      | challenges, threads, notifications | creation + notification; one per post; self; verification; order; survives post deletion; removed hidden; depth-first; 5-level pages; depth limit; same-challenge parents; placeholders; read; private                                                          |
| `moderation.test.ts`      | moderation                         | one report per item; own/missing/anonymous; 20/day; queue access and grouping; remove/restore all types; dismiss; bans log out + rank; audit list; **audit immutable for the app role**; duplicate refusal; link and burst flags                                |
| `cache.test.ts`           | Redis cache (needs Redis)          | second request served from cache; logged-in never cached; vote/new question/removal invalidate; `neededPosition`                                                                                                                                                |
| `rate-limit.test.ts`      | limits                             | login slowed; **limit shared by two app instances** via Redis                                                                                                                                                                                                   |
| `server.test.ts`          | platform                           | health; hidden 500 details; 404 shape; bad JSON; client IP with/without trusted proxy; ORIGIN_SECRET refuses direct calls but allows health checks; `no-store`; metrics by route pattern; startup refuses bad config, production without SMTP; WEB_ORIGIN slash |
| `logger.test.ts`          | logging                            | one-time values redacted from URLs                                                                                                                                                                                                                              |

**Note:** the cache, queue and Redis rate-limit tests need Redis running (`docker compose up -d` starts it). Locally an empty `REDIS_URL` still points tests at `redis://127.0.0.1:6379/1`.

## Concurrency tests

Races are tested by firing requests together:

```ts
// posts.test.ts:118
await setStance(session, "for");
await skipCooldown(userId);
const results = await Promise.all([
  setStance(session, "against"),
  setStance(session, "neutral"),
]);
expect(results.map((r) => r.statusCode).sort()).toEqual([200, 429]);
expect(await db.select().from(stanceHistory)).toHaveLength(2);
```

This is the only reliable way to prove that `FOR UPDATE`, `ON CONFLICT` and atomic increments are actually in place.

## Shared and web unit tests

| File                                     | Proves                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/validation.test.ts` | username rules (`it.each` over good and bad names, incl. `émile`); email trimming/lower-casing; password 12–128; login doesn't apply sign-up rules; question title normalisation and `?`; post/challenge minimums; Top as default sort; blank comments; reports can't claim `automated` |
| `apps/web/src/api.test.ts`               | the 502 wake-and-retry loop (fake timers, stubbed `fetch`)                                                                                                                                                                                                                              |
| `apps/web/src/markdown.test.ts`          | sanitiser: scripts, handlers, `javascript:`, images, iframes, safe links, headings                                                                                                                                                                                                      |

## Writing a new API test (recipe)

1. `beforeEach(resetDatabase)`.
2. Create users via `register(...)` (real flow) or a local helper that inserts a verified user and session.
3. Call the route with `post`/`get` (`app.inject`).
4. Assert the status, the body shape **and** the database state (`db.select()` from the table).
5. For a new constraint, also test the race.
