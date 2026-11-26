# Complete Learning Roadmap

**Goal:** understand Perspective well enough to explain, debug and rebuild it yourself.

## The 13 modules (as established in the learning tour)

The tour started on 25 October 2026 with this order. The prompt for this knowledge base listed Testing (10) before Website (11); the tour itself had **Website as 10 and Testing as 11**. This roadmap keeps the tour's order, because the E2E tests (Module 11) drive the website, so understanding the website first makes them readable. Either order works.

| #   | Module            | You'll understand                                                              | Status in the tour  |
| --- | ----------------- | ------------------------------------------------------------------------------ | ------------------- |
| 1   | Setup             | folder layout, pnpm workspaces, TypeScript settings, lint/format, `.env`, Git  | ✅ lessons 1–4 done |
| 2   | Database          | Docker, Postgres, the two roles, schema, migrations                            | 🟡 lessons 1–2 done |
| 3   | API skeleton      | Fastify, env validation, logging, errors, health checks                        | next                |
| 4   | Authentication    | password hashing, sessions and cookies, CSRF, rate limits, email links, Google |                     |
| 5   | Questions         | creating and listing, slugs, search                                            |                     |
| 6   | Stances and posts | choosing a side, the 24 h cooldown, transactions                               |                     |
| 7   | Votes and ranking | weights, Top/Hot/New, cursor paging                                            |                     |
| 8   | Challenges        | debate threads, nested replies, notifications                                  |                     |
| 9   | Moderation        | reports, removal, bans, tamper-proof audit log, spam checks                    |                     |
| 10  | The website       | React, routing, loading data, forms, the design                                |                     |
| 11  | Testing           | unit, API and browser tests, CI                                                |                     |
| 12  | Deployment        | Docker images, Vercel/Render/Neon, the proxy secret, email                     |                     |
| 13  | Scaling lab       | load testing, indexes, cache, multiple instances, queue, replica, monitoring   |                     |

**Verified against the implementation:** every module maps to real code; nothing in the list is planned-only. Two scope notes:

- Module 8 also covers **notifications**, which live in their own module folder (`modules/notifications`) but are written by the challenge code.
- Module 13 covers features that are **lab-only** (not in production). Study them as "how it would scale", not "how it runs today".

## Prerequisite concepts, and where to learn them here

| Before module | Learn                                                       | Read                                                                                                                                                                     |
| ------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1             | what a monorepo is; how TypeScript checks types             | [TYPESCRIPT_FUNDAMENTALS](../06_TYPESCRIPT_AND_BACKEND/TYPESCRIPT_FUNDAMENTALS.md)                                                                                       |
| 2             | tables, keys, constraints, transactions                     | [DATABASE_FUNDAMENTALS](../05_DATABASE/DATABASE_FUNDAMENTALS.md)                                                                                                         |
| 3             | HTTP requests and responses, JSON, async/await              | [ASYNC_PROGRAMMING](../06_TYPESCRIPT_AND_BACKEND/ASYNC_PROGRAMMING.md), [FASTIFY_EXPLAINED](../06_TYPESCRIPT_AND_BACKEND/FASTIFY_EXPLAINED.md)                           |
| 4             | cookies, hashing, CSRF                                      | [COOKIE_SECURITY](../07_SECURITY/COOKIE_SECURITY.md), [PASSWORD_SECURITY](../07_SECURITY/PASSWORD_SECURITY.md), [CSRF_CORS_AND_XSS](../07_SECURITY/CSRF_CORS_AND_XSS.md) |
| 5–7           | indexes, joins, row locks, keyset paging                    | [SQL_CONCEPTS_USED](../05_DATABASE/SQL_CONCEPTS_USED.md), [INDEXING](../05_DATABASE/INDEXING_AND_QUERY_OPTIMIZATION.md)                                                  |
| 8             | trees, recursion                                            | [CHALLENGES_AND_THREADS](../04_FEATURE_DEEP_DIVES/CHALLENGES_AND_THREADS.md)                                                                                             |
| 10            | React components, state, hooks                              | [FRONTEND_ARCHITECTURE](../01_ARCHITECTURE/FRONTEND_ARCHITECTURE.md)                                                                                                     |
| 12            | Docker images, reverse proxies, env vars                    | [INFRASTRUCTURE_AND_DEPLOYMENT](../01_ARCHITECTURE/INFRASTRUCTURE_AND_DEPLOYMENT.md)                                                                                     |
| 13            | latency percentiles (p95), throughput, caching, replication | [SCALING_AND_INFRASTRUCTURE_EXPERIMENTS](../09_TESTING_AND_DEPLOYMENT/SCALING_AND_INFRASTRUCTURE_EXPERIMENTS.md)                                                         |

## Suggested pace

One module per 2–4 study sessions. For each module:

1. Read the module's section in [MODULE_BY_MODULE_STUDY_GUIDE.md](MODULE_BY_MODULE_STUDY_GUIDE.md).
2. Open the listed files and read them top to bottom with the guide beside you.
3. Run the related tests (`pnpm --filter @perspective/api test -- votes`) and break something on purpose to see which test fails.
4. Do the module's exercises in [PRACTICAL_CODING_EXERCISES.md](PRACTICAL_CODING_EXERCISES.md).
5. Answer the module's questions in [INTERVIEW_QUESTIONS.md](INTERVIEW_QUESTIONS.md) **out loud**, without looking.

## Milestones

| After modules | You should be able to…                                                                    |
| ------------- | ----------------------------------------------------------------------------------------- |
| 1–3           | start everything from a fresh clone; explain what happens when the API boots              |
| 4             | draw the login flow from click to database and back; explain each cookie flag             |
| 5–7           | write a new keyset-paginated endpoint with its index; explain every number on a post card |
| 8–9           | explain the recursive CTE; explain why the audit log can't be edited                      |
| 10–11         | add a page with a query and a mutation; write an API test and an E2E test                 |
| 12            | redeploy, rotate a secret, diagnose a 403 or 502 in production                            |
| 13            | explain every row of the "Results at a glance" table and what you would do next           |
