# End-to-End Testing (Playwright)

## Setup

`e2e/playwright.config.ts`:

- **Two servers started automatically** (`webServer`): the API via `tsx src/server.ts` on **3100** (`NODE_ENV=test`, `WEB_ORIGIN=http://localhost:5174`, `DATABASE_URL` → `perspective_test`, **`REDIS_URL=""`** so caching can't influence page tests) and Vite on **5174** with `API_PROXY_TARGET=http://127.0.0.1:3100`. Different ports from `pnpm dev`, so both can run side by side.
- `workers: 1`, `fullyParallel: false`: one shared database and shared rate limits.
- Chromium only (Desktop Chrome profile).
- CI: `forbidOnly` (a stray `test.only` fails the build), `retries: 1`.
- Traces retained on failure, screenshots on failure, HTML report.

`e2e/global-setup.ts` runs migrations against `perspective_test` and empties it (`delete from reports; delete from questions; delete from users; delete from oauth_pending;`).

## The `person` fixture (`e2e/fixtures.ts`)

Most tests need logged-in people. Creating them through the sign-up form would be slow and would hit the 5-per-hour sign-up limit, so the fixture writes them **directly into the database** (D53):

1. `INSERT INTO users (username, email, role, email_verified_at, created_at)` with options `role`, `verified`, `ageDays` (default 30 days old, so they can vote).
2. Generate a random token, insert `sessions(token_hash = sha256(token))`, exactly like the API does.
3. Open a new browser context and add the `session` cookie (`httpOnly`).
4. Return `{ username, email, id, page, api }`, where `api(method, path, body)` calls the API as this person (useful for setup steps).

Each person gets their own browser context, so tests can have two people interacting (author and challenger).

The **auth spec** deliberately doesn't use the shortcut: it goes through the real sign-up form, confirms the email, logs out and logs back in.

## The journeys covered

| Spec                 | Test                                                      |
| -------------------- | --------------------------------------------------------- |
| `auth.spec.ts`       | sign up → confirm email → log out → log in                |
|                      | sign-up explains invalid fields before calling the server |
|                      | members-only pages send visitors to log in                |
| `questions.spec.ts`  | ask a question → find it → get duplicate suggestions      |
|                      | unverified accounts are asked to verify before asking     |
| `posts.spec.ts`      | take a side → write a post → edit → delete                |
| `votes.spec.ts`      | vote across sides → earn the badge → re-sort              |
|                      | explains why a reader can't vote yet                      |
| `challenges.spec.ts` | challenge a post → author notified → debate in a thread   |
|                      | deep threads continue on their own page                   |
| `moderation.spec.ts` | report → review → remove → restore                        |
|                      | a ban logs the person out immediately                     |
|                      | non-moderators can't open the dashboard                   |

## Selector style

Tests find elements by **role and accessible name** (`getByRole("button", { name: "Log in" })`), like a user or screen reader would, rather than by CSS classes. This makes tests survive redesigns: after the November redesign only two selectors needed updating ("Login" became "Log in"; search moved to `/questions`). Playwright's strict mode fails if a selector matches two elements, which is why the ban button needed `exact: true` (it also matched "Unban").

## Running

```sh
pnpm --filter @perspective/e2e exec playwright install chromium   # once
pnpm test:e2e
npx playwright show-report e2e/playwright-report                   # after a failure
```

Docker (Postgres) must be running. Don't run `pnpm test` at the same time.
