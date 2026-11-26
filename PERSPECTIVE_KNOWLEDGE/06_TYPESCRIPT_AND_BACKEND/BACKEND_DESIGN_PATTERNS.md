# Backend Design Patterns Used

Named patterns you can recognise and explain in an interview, each with where it appears.

| Pattern                                    | What it is                                                                           | Where                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Modular monolith**                       | One deployable, organised by feature                                                 | `src/modules/*`                                                                 |
| **App factory**                            | A function that builds the app without starting it, so tests and production share it | `buildApp()`                                                                    |
| **Middleware / hook pipeline**             | Cross-cutting steps run in order around every request                                | `onRequest` / `preHandler` / `onSend` hooks                                     |
| **Guard**                                  | A precondition function that throws if not met                                       | `requireUser`, `requireVerifiedEmail`, `requireRole`                            |
| **Factory function / closure**             | A function returning a configured function                                           | `requireRole(minimum)`, `rateLimit(max, minutes)` in auth routes                |
| **Schema-first validation**                | Declare the shape; the framework enforces it                                         | Zod schemas on every route                                                      |
| **Shared kernel**                          | Code shared by client and server                                                     | `packages/shared`                                                               |
| **Domain error type**                      | One error class for expected failures, carrying a code                               | `AppError` + `errorHandler`                                                     |
| **Fail fast at startup**                   | Validate config before serving                                                       | `env.ts`                                                                        |
| **Unit of work (transaction)**             | Group related writes so they commit together                                         | votes, stances, challenges + notifications, moderation + audit                  |
| **Pessimistic locking**                    | Lock a row before deciding                                                           | `SELECT ... FOR UPDATE` in stances                                              |
| **Optimistic concurrency via constraints** | Try the write; let a unique index reject the loser                                   | slugs, one post per side, first stance                                          |
| **Idempotent operations**                  | Repeating has no further effect                                                      | `ON CONFLICT DO NOTHING` for votes and reports; `PUT` stance                    |
| **Denormalised counters**                  | Store aggregates, maintain them on write                                             | `helpful_score`, `for_count`                                                    |
| **Snapshot**                               | Copy a value at event time                                                           | `posts.stance`, `post_votes.voter_stance/weight`                                |
| **Soft delete**                            | Mark instead of removing                                                             | `deleted_at`, `removed_at`                                                      |
| **Keyset pagination**                      | Continue after the last seen key                                                     | every list                                                                      |
| **Opaque cursor**                          | Encode paging state; the client doesn't interpret it                                 | base64url JSON post cursors                                                     |
| **Adjacency list + recursive query**       | Tree stored by parent pointers                                                       | comments                                                                        |
| **Polymorphic association**                | `(type, id)` reference                                                               | reports, audit log                                                              |
| **Append-only log**                        | Insert-only history, enforced by permissions                                         | `audit_log`                                                                     |
| **Least privilege**                        | Minimal permissions per component                                                    | two DB roles, non-root containers, read-only CI token                           |
| **Token hashing**                          | Store only `hash(secret)`                                                            | sessions, email tokens, pending sign-ins                                        |
| **Constant-time comparison**               | Compare secrets without timing leaks                                                 | `timingSafeEqual` in the proxy secret                                           |
| **Graceful degradation / fail open**       | Keep working without an optional dependency                                          | no Redis → no cache, in-memory limits, send email now                           |
| **Feature flags by configuration**         | Off unless configured                                                                | Google, Redis, replica, metrics, tracing                                        |
| **Cache-aside with versioned keys**        | Read cache, else DB then store; invalidate by bumping a version                      | `cache.ts` (lab)                                                                |
| **Read-your-writes routing**               | Read the replica only if it has caught up                                            | LSN check (lab)                                                                 |
| **Queue + worker**                         | Move slow side effects out of the request                                            | BullMQ emails (lab)                                                             |
| **Retry with exponential backoff**         | Retry failures with growing waits                                                    | BullMQ jobs; frontend 502 retry (fixed 3 s)                                     |
| **Health checks: liveness vs readiness**   | "Process alive" vs "can serve"                                                       | `/health` vs `/health/ready`                                                    |
| **Graceful shutdown**                      | Finish in-flight work on SIGTERM                                                     | `server.ts`, `worker.ts`                                                        |
| **Advisory lock for single execution**     | Only one instance runs a task                                                        | migrations                                                                      |
| **Ports-and-adapters-lite**                | Swap an implementation by config                                                     | `Executor` (db or tx), `reader` (primary or replica), mailer (log, SMTP, queue) |

## A few in more depth

### Guard + domain error = readable handlers

```ts
const user = requireUser(request);
const post = await findPost(request.params.id, user.id); // 404 if not live
if (post.authorId === user.id) throw new AppError(403, "OWN_POST", "...");
const stance = await findStance(user.id, post.questionId);
if (!stance) throw new AppError(409, "STANCE_REQUIRED", "...");
```

The handler reads like the business rules. No `if (error) return res.status(...)` plumbing, because errors propagate to one handler.

### "Check after insert" for spam

`rejectDuplicate` runs _after_ the insert, inside the transaction, and throws to roll back. Two benefits: the more specific unique-index error wins (the insert fails first), and the check sees the database exactly as the transaction does.

### Write the side effect in the same transaction, or not at all

Notifications, audit entries, automated reports and score updates are written in the same transaction as their cause. Emails are not (they can't be rolled back once sent), so they happen after the commit, queued with retries when possible. This is the rule that decided what moved to the queue in Phase 9 (D70).

### Invalidate after commit

`bumpCache` is always called **after** `db.transaction(...)` returns. Bumping before the commit would let a concurrent reader cache the _old_ data under the _new_ version, and it would stay stale until the TTL expired.
