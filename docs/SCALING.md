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

## 3. Redis cache for logged-out visitors

Logged-out visitors (70% of traffic) all see identical pages, so their
responses for the question list, search, a question and its columns are kept
in Redis as finished JSON. A hit skips the query building, the database and
the serialiser. Logged-in pages (which show "you voted") are never cached.

**Invalidation uses version numbers.** Each cached page belongs to scopes:
`questions` (list and search), `question:<slug>` (one question and its
columns) and `moderation` (everything). Writes bump the scope's version after
their transaction commits (new question; new, edited or deleted post; vote;
new challenge; moderator remove or restore). The cache key contains the
current versions, so after a bump the old entries are simply never read again
and expire on their own; nothing has to find and delete them. Bumping after
the commit matters: bumping first would let a reader cache the old data under
the new version.

| Visits/s | Requests/s | p95   | Failed | Cache hits | API CPU | Postgres CPU   |
| -------- | ---------- | ----- | ------ | ---------- | ------- | -------------- |
| 50       | 366        | 21 ms | 0%     | 33%        | 50%     | **48%** (109%) |
| 100      | 619        | 9.2 s | 0%     | 36%        | 98%     | 79% (146%)     |
| 150      | 661        | 26 s  | 8.2%   | 37%        | 95%     | 44%            |
| 200      | 725        | 24 s  | 26%    | 36%        | 101%    | 87%            |

(In brackets: the baseline.) With a 10-minute expiry instead of 60 s, the
warm cache answered **49%** of cacheable requests and the API handled
**697 requests/s** at 100 visits/s; Redis used 137 MB. Explicit invalidation
makes the expiry only a safety net, so the longer one is kept.

**Findings**

- The database's load roughly halved at the same traffic. It is the part that
  is hardest to scale, so this is the most valuable effect.
- The API's ceiling moved only from about 600 to 700 requests/s: misses,
  logged-in visitors and uncached endpoints still cost the same, and the API's
  single CPU is still the limit.
- The hit rate is capped by the long tail: the top 1% of questions gets only
  about 22% of visits, and most questions are viewed less often than their
  cache entry lives. Caching helps the head, not the tail.
- Next: run several API instances, which first needs sessions and rate limits
  that work across instances.

## 4. State that works across instances

Before running several API instances, every piece of per-instance state was
checked:

- **Sessions** were already in Postgres, so every instance sees every session.
  Moving them to Redis would save a 0.06 ms query (1.4 s of database time in a
  whole 150 visits/s run): not worth the change, so they stay.
- **Rate limits** were counted in each instance's memory: with 4 instances an
  attacker would get 4 × 10 login attempts. They are now counted in Redis.
  A test drives two app instances alternately and checks the 11th attempt is
  refused (and fails with in-memory counting). If Redis is down the limits are
  skipped rather than blocking every login; the daily limits on questions,
  posts and challenges are counted in Postgres and still apply.
- Daily limits, OAuth sign-in state and the cache were already shared.

## 5. Several instances behind a load balancer

nginx (`load/nginx.conf`) sends each request to the instance with the fewest
open requests and adds the visitor to `X-Forwarded-For`. Each instance has
1 CPU. Two lab mistakes were found on the way and are worth knowing:
recreating the load balancer made Docker Compose quietly scale the API back
to one instance (fixed with `--no-deps`), and the first nginx config (one
worker, 8,192 connections) ran out of connections before the API did: the
load balancer itself became the bottleneck.

Traffic at about 80% of each setup's expected capacity:

| Instances | Offered      | Requests/s   | p95    | Failed | Requests per API CPU-second |
| --------- | ------------ | ------------ | ------ | ------ | --------------------------- |
| 1         | 80 visits/s  | 588          | 164 ms | 0%     | 609                         |
| 2         | 160 visits/s | 979 (+66%)   | 9.8 s  | 0%     | 499                         |
| 4         | 320 visits/s | 1,178 (+20%) | 31 s   | 14.6%  | 305                         |

CPU during a 4-instance run: API 4 × 1.0, **Postgres 4.5**, k6 1.4, nginx 0.5,
Redis 0.2 cores: about 11 of the laptop's 16 threads, plus Windows.

**Findings**

- Adding an instance adds capacity: 1 → 2 gave +66%.
- Beyond that the laptop is the limit. The instances, the database, the load
  generator and the load balancer share one machine whose 16 threads include
  8 slower efficiency cores, so each instance gets less real work done per
  "CPU" (609 → 305 requests per CPU-second). In production each instance
  would have its own machine. This lab can't show linear scaling, and the
  numbers say so instead of hiding it.
- The database is now the largest single consumer (4.5 cores): the next
  bottleneck, which is what a read replica is for.
