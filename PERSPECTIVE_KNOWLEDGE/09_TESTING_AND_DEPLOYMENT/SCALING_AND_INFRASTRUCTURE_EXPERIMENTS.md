# Scaling and Infrastructure Experiments (Phase 9)

> **Scope label:** everything on this page ran in the **local load-testing lab** (Docker Compose `load` profile, one laptop). **None of it is switched on in production**, which runs one API instance with no Redis. The code paths are inactive there because their environment variables are unset. The raw measurements are in `docs/SCALING.md`; this page explains the mechanisms.

## The method

"Measure → find the bottleneck → change one thing → measure again → write down what changed."

| Element           | Choice                                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data              | `perspective_load`: 200k users, 50k questions, 1.1M stances (+1.1M history), 278k posts, 1.5M votes, 55k challenges, 135k comments (~1.4 GB), lopsided popularity                                                                                        |
| Traffic           | `load/k6/browse.js`: each visit = home, sometimes search (30%), a question + three columns, a post (40%), a challenge thread (15%); 30% logged in, a fifth of those vote; ~6.5 requests/visit; each virtual visitor has its own IP via `X-Forwarded-For` |
| System under test | The **production API image** capped at **1 CPU / 512 MB** (`api-load`), like one small cloud instance                                                                                                                                                    |
| Noise control     | Medians of repeated runs; judge by the targeted metric (D65)                                                                                                                                                                                             |
| Tools             | k6, `pg_stat_statements`, `EXPLAIN (ANALYZE, BUFFERS)`, Node `--cpu-prof`, Prometheus/Grafana, Jaeger                                                                                                                                                    |

Reproduce: `pnpm load:migrate && pnpm load:seed && pnpm load:fixtures`, then `docker compose --profile load up -d --build api-load`, then `docker compose --profile load run --rm k6 run -e RATE=50 /load/k6/browse.js` (README / SCALING.md).

## Results at a glance

| Step                         | Targets                               | Before              | After                                            |
| ---------------------------- | ------------------------------------- | ------------------- | ------------------------------------------------ |
| 1 Baseline                   | capacity of 1 instance                | –                   | ~600 req/s; p95 18 ms at 366 req/s               |
| 2 Index matches filter       | busiest column query                  | 3.0 ms, 1,729 pages | **0.4 ms, 95 pages**                             |
| 3 Redis cache (logged out)   | DB CPU at 50 visits/s                 | 109%                | **48%**                                          |
| 4 Rate limits in Redis       | login attempts across N instances     | N × 10              | **10**                                           |
| 5 Load balancer, 2 instances | requests/s                            | 588                 | **979 (+66%)**                                   |
| 6 Email queue                | signup during an email outage         | email lost          | **delivered after the outage**; signup in 0.39 s |
| 7 Read replica               | successful req/s, DBs capped at 1 CPU | 275 (55% failed)    | **558 (1.2% failed)**                            |
| 7 LSN check                  | stale reads right after a write       | 100% without it     | **0%**                                           |
| 8 Search engine?             | search share of DB time               | 18–26%              | not needed yet (D72)                             |
| 9 Tracing cost               | API CPU per request                   | 1.65 ms             | 3.39 ms at 100%; 2.36 ms at 1%                   |

The bottleneck moved: API CPU (1) → database (5) → the single replica (7).

## 1. Baseline

At 100 visits/s the single API CPU hit 98% and requests queued: p95 jumped from 18 ms to 6.5 s. The database stayed under 10% of its 16 threads. Profiling the API showed where CPU went: Drizzle building SQL text 22%, garbage collection 12%, network writes 12%, the pg driver 7%, Fastify 4%, route code 3%, helmet/pino/zod ~2% each.

## 2. Indexes

See [INDEXING_AND_QUERY_OPTIMIZATION.md](../05_DATABASE/INDEXING_AND_QUERY_OPTIMIZATION.md). The win was in the worst case (the most popular questions), not the average.

## 3. The response cache (`apps/api/src/cache.ts`, D67)

**Idea:** 70% of visitors are logged out and see identical pages. Store the finished JSON in Redis and serve it without touching Drizzle, Postgres or the serializer.

**Which routes:** `GET /questions`, `/questions/search` (config `questionListCache`, TTL 60 s), `GET /questions/:slug`, `/questions/:slug/posts` (`questionCache`, TTL 600 s). Opted in with `config: { cache: ... }` on the route.

**Invalidation by versioned scopes** (the clever part):

```
version:questions          → 41
version:question:<slug>    → 7
version:moderation         → 2

key = cache:question:<slug>@7,moderation@2:/questions/<slug>/posts?stance=for&sort=top
```

- Each cached page belongs to **scopes**. The key includes the scopes' **current version numbers**.
- A write **bumps** (increments) the versions of the scopes it affects, **after its transaction commits**: new question → `questions`; post/vote/challenge/stance → `question:<slug>`; moderator remove/restore → `moderation` (shared by every page, because removals are rare and can affect anything).
- Old keys aren't deleted: they're simply never built again, and they expire by TTL. Invalidation = one `INCR`, not "find every key that might contain this post".
- **Why bump after commit:** bumping first would let a concurrent reader fetch the _old_ data and store it under the _new_ version, leaving it stale for 10 minutes.

**The hooks:**

- `serveFromCache` (`preHandler`, after `loadSession`): for logged-out GETs on a cached route, `MGET` the versions, build the key, `GET` it. Hit → send the stored string with `x-cache: hit`. Miss → remember the key (`x-cache: miss`).
- `storeInCache` (`onSend`): if a key was remembered and the status is 200, `SET key payload EX ttl`, without waiting for Redis to answer.
- **Logged-in requests are never cached** (they contain `votedByMe`).
- Any Redis error → log a warning and continue without the cache.

**Redis memory policy:** `maxmemory 256mb`, `volatile-lru`: when full, evict the least recently used keys **that have an expiry**. Pages have expiries; version counters don't, so they're never evicted.

**Results:** DB CPU 109% → 48% at 50 visits/s; API ceiling ~600 → ~700 req/s (the API's own CPU stayed the limit); hit rate ~49% with a 10-minute TTL. **The long tail limits caching:** the top 1% of questions got only ~22% of visits; most questions are viewed less often than their entry lives.

## 4. Shared state across instances (D68)

Before running several instances, every piece of per-process state was audited:

| State                | Before                | Decision                                                         |
| -------------------- | --------------------- | ---------------------------------------------------------------- |
| Sessions             | Postgres (shared)     | **keep**: 0.06 ms lookup; moving gains nothing                   |
| Request-rate limits  | each process's memory | **move to Redis**: otherwise 4 instances = 4× the login attempts |
| Daily content limits | Postgres              | keep                                                             |
| OAuth state          | cookie + Postgres     | already shared                                                   |
| Cache                | Redis                 | already shared                                                   |

`@fastify/rate-limit` gets `redis` and `nameSpace: "rate-limit:"`; `skipOnError: true` fails open. Test: two app instances, alternating login attempts; the 11th is refused.

## 5. Load balancer and multiple instances (D69)

nginx (`load/nginx.conf`), `least_conn` (send each request to the instance with the fewest open requests, which suits requests of uneven cost), keepalive to upstreams, `X-Forwarded-For` appended. `docker compose --profile load up -d --scale api-load=4`; Docker DNS returns every replica.

| Instances | Requests/s | Per API CPU-second |
| --------- | ---------- | ------------------ |
| 1         | 588        | 609                |
| 2         | 979 (+66%) | 499                |
| 4         | 1,178      | 305 (laptop-bound) |

**Lab mistakes worth remembering:** Compose quietly scaled the API back to 1 when the load balancer was recreated (fixed with `--no-deps`), and nginx ran out of connections before the API did.

## 6. Background jobs (D70)

**What moved:** only emails. With Redis, `sendEmail` adds a BullMQ job (8 attempts, exponential backoff from 5 s; completed jobs removed, failed ones kept 24 h). A separate process (`dist/worker.js`, same image, compose service `worker`) sends them with concurrency 5. Without Redis, or if queueing fails, the email is sent in the request as before.

**What deliberately did not move:** notifications and score updates must commit atomically with the action (D49), and a queue would break that guarantee for no gain.

**Tested:** with the mail server stopped, signup returned 201 in 0.39 s; the worker logged failed attempts; after the mail server came back, the email arrived.

**Known shortcut:** the queue shares the cache's `volatile-lru` Redis. Job data has no expiry (safe), but BullMQ's short lock keys do, so under memory pressure an email could be sent twice. Production would use a separate `noeviction` Redis.

## 7. Read replica with read-your-writes (D71)

**Setup:** `postgres-replica` clones the primary with `pg_basebackup` (using the `replicator` login from `02-replication.sh`) and then streams its **write-ahead log** (WAL), staying a few ms behind. `DATABASE_REPLICA_URL` enables `replicaPool` / `replicaDb`.

**The problem: lag.** You vote, the page reloads from the replica, and your vote isn't there. Worse: a logged-out request right after a vote could store the _old_ page in the cache under the _new_ version.

**The solution: WAL positions (LSNs) per scope.**

```mermaid
sequenceDiagram
  participant W as Write request (vote)
  participant P as Primary
  participant R as Redis
  participant Q as Later read
  participant RP as Replica
  W->>P: COMMIT
  W->>P: select pg_current_wal_lsn()
  W->>R: Lua: INCR version:question:x; SET lsn:question:x = max(old, new)
  Q->>R: MGET version:…, lsn:…
  Q->>RP: select pg_last_wal_replay_lsn() >= needed
  alt replica caught up
    Q->>RP: read from replica
  else behind
    Q->>P: read from primary
  end
```

- After a write commits, `bumpCache` reads the primary's current WAL position and stores it per scope with an **atomic Lua script** that only ever _raises_ the stored value. Two concurrent writers can't lower it.
- On a read, `serveFromCache` takes the highest position among the page's scopes (`neededPosition`, using `BigInt`, since positions exceed JavaScript's safe integer range) and asks the replica whether it has replayed that far. Only then does `readerFor(request)` return the replica.
- This works for logged-in reads too (they skip the cache but still use the check).

**Tested** with the replica deliberately delayed 300 ms (`recovery_min_apply_delay`): **0 of 10,264** reads were stale with the check, and **10,390 of 10,390** without it. Normally 87% of question and post reads went to the replica.

**Capacity** (each DB capped at 1 CPU, 2 API instances): primary only 275 successful req/s with 55% failing at 140 visits/s; with the replica 558/s and 1.2% failing. The replica then became the bottleneck, and a busy replica lagged up to 3.5 s; the check automatically sent the affected reads back to the primary.

## 8. Search engine? Not yet (D72)

Search was the most expensive single query (18% of the primary's and 26% of the replica's query time, from ~4% of requests), but three quarters of DB time was elsewhere. A search engine would cost a new service, a sync pipeline and more staleness. Revisit above ~40% of DB time after caching, or when typo tolerance or facets are needed.

## 9. Observability (D73)

- **Metrics** (`telemetry.ts`, prom-client): `http_request_duration_seconds` by method, **route pattern** (`/posts/:id`, not the URL, so ids don't create a time series each) and status; `cache_lookups_total{result}`; `cached_route_reads_total{database}`; Node defaults (CPU, memory, event-loop delay). Served on a private `METRICS_PORT` that is never published. Prometheus finds replicas through Docker DNS; Grafana's dashboard is provisioned from `load/observability/grafana/perspective-api.json`.
- **Tracing** (`instrumentation.ts`): OpenTelemetry spans for each request, its handler, every Postgres query and every Redis command, exported via OTLP to Jaeger. It must be loaded **before** the app (`NODE_OPTIONS=--import ./dist/instrumentation.js`), because pg and ioredis have to be patched before they're imported. An ESM loader hook is registered so `import`s are instrumented too.
- **Cost:** CPU per request 1.65 ms (off) → 3.39 ms (every request); even 1% sampling costs 2.36 ms, because ~0.7 ms is the instrumentation wrapping every call, whether or not the span is recorded. **Conclusion:** metrics always on in the lab; tracing opt-in for investigations.

## What would carry over to a real production scale-up

1. Redis for rate limits as soon as there's more than one instance.
2. The response cache for logged-out traffic.
3. A replica with the LSN check if reads saturate the primary.
4. The queue on a dedicated non-evicting Redis.
5. Metrics from day one; tracing on demand.
6. All of it is already configuration away: the code paths exist and are tested.
