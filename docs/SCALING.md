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
