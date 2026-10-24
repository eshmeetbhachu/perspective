# Scaling log (Phase 9)

Every change follows the same loop: measure, find the bottleneck, change one
thing, measure again. This file records each measurement.

## How to reproduce

```sh
docker compose up -d --wait            # Postgres (with pg_stat_statements)
pnpm load:migrate                      # schema in the perspective_load database
pnpm load:seed                         # ~4.4 million rows, ~12 minutes
pnpm load:fixtures                     # test targets + 2,000 logged-in sessions
docker compose --profile load up -d --build api-load
docker compose --profile load run --rm k6 run -e RATE=50 /load/k6/browse.js
```

(From Git Bash, prefix the k6 command with `MSYS_NO_PATHCONV=1`.)

- **Data:** 200,000 users, 50,000 questions, 1.1 M stances (plus 1.1 M history
  rows), 278,000 posts, 1.5 M votes, 55,000 challenges, 135,000 comments;
  1.4 GB. Popularity is lopsided like a real site: most questions have a
  handful of participants, a few have thousands.
- **Traffic (`load/k6/browse.js`):** each visit loads the home page, searches
  30% of the time, opens a question (popular ones far more often) with its
  three columns, opens a post 40% of the time and a challenge thread 15% of
  the time. 30% of visitors are logged in; a fifth of those vote. One visit is
  about 6.5 requests. Every visitor has its own IP, so rate limits apply per
  visitor.
- **Machine:** i5-12500H laptop, Docker with 16 threads and 8 GB. The API
  under test is the production image limited to **1 CPU and 512 MB**, like one
  small cloud instance. Postgres is not limited.

## 1. Baseline

| Visits/s | Requests/s | Median | p95    | p99    | Failed | API CPU | Postgres CPU |
| -------- | ---------- | ------ | ------ | ------ | ------ | ------- | ------------ |
| 10       | 73         | 6 ms   | 15 ms  | 23 ms  | 0%     | 12%     | 22%          |
| 25       | 185        | 5 ms   | 15 ms  | 22 ms  | 0%     | 29%     | 46%          |
| 50       | 366        | 5 ms   | 18 ms  | 33 ms  | 0%     | 52%     | 109%         |
| 100      | 633        | 2.1 s  | 6.5 s  | 9.3 s  | 0%     | 98%     | 146%         |
| 150      | 599        | 6.9 s  | 26.7 s | 32.9 s | 9.6%   | (maxed) | 128%         |

(Postgres CPU is out of 1,600%: it may use all 16 threads. At 150 visits/s the
API CPU sample failed under the overload; the container did not crash or run
out of memory. The failures were client timeouts and dropped connections.)

**Findings**

- The ceiling is about **600 requests/s**, set by the API's single CPU. At
  100 visits/s it sits at 98% and requests queue: p95 jumps from 18 ms to
  6.5 s. Past that point more traffic only adds waiting, then errors.
- The database is not the bottleneck yet: average query times stay flat under
  overload (about 1 ms for most queries) and it uses under 10% of its CPU.
- The most expensive query is search: about 10 ms per call and the largest
  share of total database time. Next most: the question listing (about 1 ms,
  but called the most).

## 2. Query plans and indexes

`pg_stat_statements` ranked the queries by total time during the baseline,
then `EXPLAIN (ANALYZE, BUFFERS)` showed what each one does.

| Query               | Calls (2 min @150) | Avg     | What the plan showed                                                                                                |
| ------------------- | ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------- |
| Search, common word | 3,718              | 10.9 ms | "cities" matches 16% of all questions, so Postgres reads the whole table, ranks all 7,959 matches, keeps 30         |
| Search, rare word   | -                  | 0.6 ms  | Uses the GIN index                                                                                                  |
| Latest questions    | 11,270             | 1.0 ms  | Walks the primary key backwards and stops at 21; the time is the 21 author lookups                                  |
| Post column, Top    | 18,245             | 0.5 ms  | Busiest column (337 posts): reads **all** 337, looks up 337 authors, sorts, keeps 11: **3.0 ms, 1,729 pages**       |
| Post column, Hot    | 5,159              | 1.5 ms  | Score depends on the current time, so the whole column is read and sorted (5 ms for the busiest); no index can help |

**Fix:** the two column indexes were partial on `deleted_at is null`, but the
listing also filters `removed_at is null`. Postgres couldn't trust the index
to return only matching rows in order, so it fetched the whole column and
sorted it. With the index condition matching the query exactly (migration
`0010`), the busiest column reads 11 rows in index order and stops:
**3.0 ms → 0.4 ms, 1,729 → 95 pages**. Average column time hardly moves
because most columns are small; the win is in the worst case, which is the
most-viewed questions.

**Measurement noise.** Three identical runs at 50 visits/s gave p95 of 26, 25
and 38 ms (one stray run gave 81 ms). Laptop background apps and CPU speed
changes move p95 by ±50%, so from here on results are the median of repeated
runs, and changes are judged by the number they target (query time, CPU per
request) rather than one end-to-end run. End to end, the index change can't
show yet: the API's CPU, not the database, sets the ceiling.

**Where the API's CPU goes** (Node `--cpu-prof`, 60 s at 50 visits/s):

| Share of busy CPU | What                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| 22%               | drizzle-orm building SQL text from the query builder, on every request |
| 12%               | garbage collection                                                     |
| 12%               | network writes: queries to Postgres (2.5 s) and HTTP responses (1.9 s) |
| 7%                | pg driver and protocol                                                 |
| 4%                | fastify                                                                |
| 3%                | our route code                                                         |
| 2% each           | helmet, pino logging, zod                                              |

Prepared statements would remove part of the 22%, but the column query
changes shape with sort, paging and login (12 variants). A cache removes the
query building, the database round trip and the JSON serialisation for every
cache hit, and 70% of visitors are logged out and see identical pages. Next
step: caching.
