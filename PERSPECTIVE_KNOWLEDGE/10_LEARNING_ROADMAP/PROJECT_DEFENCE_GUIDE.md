# Project Defence Guide

How to present Perspective honestly and convincingly, in an interview, a viva or a portfolio review.

## Be honest about how it was built

The project was built with an AI assistant (Claude) implementing under a written working agreement, while you, the owner, made the product and architecture decisions (every 🟡 item, the hosting choice, the security rule against email auto-linking, the vote weights, the design). The strongest honest framing:

> "I designed and directed it, made the key decisions, and used an AI pair-programmer for implementation. Then I studied every part of it until I could explain and change it myself."

Interviewers will probe _understanding_, not typing. This knowledge base exists so the second half of that sentence is true. Never claim a number or a decision you can't explain; every number below is in `docs/SCALING.md` or the Decision Log.

## The 30-second pitch

"Perspective is an opinion platform where every question is split into For, Neutral and Against. People explain their reasoning, and the only vote is 'this helped me understand'. Votes from the other side count three times as much, so the ranking rewards bridging, not tribal agreement. It's a TypeScript monorepo (React, Fastify, PostgreSQL) deployed for free on Vercel, Render and Neon, with session auth, Google OIDC, moderation with a tamper-proof audit log, and close to 200 automated tests, including browser tests. I also built a scaling lab with 4.4 million rows, where I measured caching, load balancing, a job queue and a read replica with read-your-writes."

## The three stories to have ready

### Story 1: a security decision (account linking)

- **Situation:** Google sign-in plus passwords.
- **Risk:** pre-account takeover through email-based auto-linking.
- **Decision:** match by Google `sub`; hold unknown identities server-side for 15 minutes; link only after proof of control.
- **Evidence:** D27, D34; `google.test.ts` "existing accounts with the same email" block.

### Story 2: a performance investigation (index)

- **Measure:** `pg_stat_statements` ranked queries; `EXPLAIN (ANALYZE, BUFFERS)` showed the busiest column reading 1,729 pages.
- **Cause:** the partial-index condition didn't match the query filter.
- **Fix and result:** migration 0010; 0.4 ms and 95 pages.
- **Lesson:** averages hid it; the worst case is what popular pages hit.

### Story 3: a distributed-systems problem (replica lag)

- **Problem:** a replica serves reads milliseconds behind, so you vote and don't see your vote; worse, stale pages get cached.
- **Solution:** WAL positions per scope in Redis (an atomic max via Lua); read the replica only if it has replayed that far.
- **Evidence:** 0 of 10,264 stale reads vs 100% without the check, with the replica delayed 300 ms; throughput doubled under overload.

## Likely challenges, and good answers

| Challenge                                        | Answer                                                                                                                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Isn't Redis/replica overkill for this traffic?" | Yes, for production, which is why production doesn't use them. The lab exists to learn when they're needed, with measurements. They're config switches away.                  |
| "Your scaling numbers are from a laptop."        | Correct; SCALING.md says so and states where the laptop became the limit (4 instances). The relative effects and the methods are what carry over.                             |
| "Why not microservices?"                         | No measured reason; the transactional guarantees across features are valuable.                                                                                                |
| "How do you stop people gaming the votes?"       | Verified email, 24 h account age, stance cooldown, no self-votes, one vote per post. It's not fully solved: false stances are a known weakness, listed as future work.        |
| "What happens if the database goes down?"        | `/health` stays up (liveness), `/health/ready` returns 503; idle connection errors are logged, not fatal; the pool reconnects. Backups are the open gap: only 6 h of history. |
| "Your free API sleeps."                          | Measured how Render behaves (proxied requests get a 502 and don't wake it); the site wakes it directly and retries only 502s, which are safe to resend.                       |
| "What would you improve?"                        | Backups + restore test, CSP, error monitoring, unban rank check, session management, account deletion.                                                                        |

## Numbers worth memorising

| Fact                             | Value                                                     |
| -------------------------------- | --------------------------------------------------------- |
| Decisions logged                 | 75 (D1–D75)                                               |
| Tables / migrations / API routes | 15 / 13 / 46                                              |
| Tests                            | ~161 API + 13 shared (+ `it.each` cases) + 9 web + 13 E2E |
| Lab data                         | ~4.4 M rows, 1.4 GB                                       |
| Baseline capacity (1 CPU)        | ~600 req/s                                                |
| Cache effect on DB CPU           | 109% → 48%                                                |
| 2 instances                      | +66% requests/s                                           |
| Replica                          | 275 → 558 successful req/s; 0 stale reads                 |
| Tracing cost                     | ×2 CPU per request (1.65 → 3.39 ms)                       |
| Cost to run                      | $0                                                        |

## Demo script (5 minutes)

1. Landing page → `/questions` → sort by Most divided.
2. Open a question: the three columns, the stance summary.
3. Log in, take a side (show the confirmation and the cooldown), write a post.
4. As another user, vote across sides; show the weight effect and the badge.
5. Challenge a post; reply in the thread; show the notification badge.
6. As a moderator: report → queue → remove with a reason → audit log.
7. Show `docs/SCALING.md` "Results at a glance" and the Grafana dashboard screenshot if available.
