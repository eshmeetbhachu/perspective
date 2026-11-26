# Asynchronous Programming in Perspective

## Why everything is `async`

Node.js runs your JavaScript on **one thread**. Waiting for the database, Redis, an SMTP server or the network can take milliseconds to seconds. If Node simply waited, one slow query would freeze every other request. Instead, I/O is **asynchronous**: you start the operation, Node keeps serving other requests, and your code continues when the result arrives. This loop of "run ready code, then check for finished I/O" is the **event loop**.

## Promises and `async`/`await`

A **Promise** is a placeholder for a value that will arrive later (or an error). `await` pauses _this function_ until the promise settles, without blocking the thread.

```ts
async function findStance(userId: string, questionId: string) {
  const [row] = await db.select().from(userStances).where(...);   // waits for Postgres
  return row ?? null;                                               // returns Promise<Row | null>
}
```

- An `async` function always returns a Promise.
- A `throw` inside it rejects that promise; `await` re-throws it in the caller, so `try/catch` works as usual.

## Running things in parallel vs in sequence

Sequential (each waits for the previous one; needed when the second depends on the first):

```ts
const post = await findPost(id, user.id);
const stance = await findStance(user.id, post.questionId); // needs post.questionId
```

Parallel (independent operations):

```ts
// moderation/routes.ts:137: up to 50 previews fetched concurrently
const items = await Promise.all(groups.map(async (group) => {
  const target = await findTarget(group.targetType, group.targetId);
  return { ...group, preview: ... };
}));
```

`Promise.all` starts all of them, waits for all, and rejects as soon as any rejects. The `pg` pool limits how many actually run in the database at once.

On the frontend, the question page's hooks (question, stance, three columns) fire in parallel automatically, because each `useQuery` starts its own request.

## Floating promises and `void`

A promise that nobody awaits is "floating": if it rejects, the error goes unhandled. The lint rule `no-floating-promises` forbids it. When fire-and-forget is intended, the code says so explicitly:

```ts
void navigate("/"); // React Router's navigate returns a promise
void queryClient.invalidateQueries({ queryKey: ["posts"] });
process.once(signal, () => {
  void shutdown(signal);
});
```

And when the outcome doesn't matter but errors must be swallowed safely:

```ts
fetch(url, { mode: "no-cors" }).catch(() => undefined);           // wakeApi
redis.set(key, payload, "EX", ttl).catch((err: unknown) => log.warn(...));   // storeInCache: don't delay the response
```

## Top-level `await`

ES modules allow `await` outside functions:

```ts
// passwords.ts: computed once when the module loads
const dummyHash = await hashPassword("not-a-real-password");

// server.ts
const app = await buildApp();
```

Any module importing `passwords.ts` waits until the dummy hash is ready.

## Transactions are async callbacks

```ts
const row = await db.transaction(async (tx) => {
  const [current] = await tx.select()...for("update");
  ...
  return created;          // becomes the transaction's result
});                        // commit after the callback resolves; rollback if it throws
```

**Every query inside must use `tx` and be awaited.** A non-awaited query might run after the commit, outside the transaction.

## Timers

```ts
// server.ts: a shutdown deadline that doesn't keep Node alive by itself
const timer = setTimeout(() => process.exit(1), 10_000);
timer.unref();

// api.ts: sleep between retries
await new Promise((resolve) => setTimeout(resolve, 3_000));
```

Wrapping `setTimeout` in a Promise turns it into something you can `await`.

## Events (`EventEmitter`)

Some libraries report problems through events instead of promises:

```ts
pool.on("error", (err) => app.log.error({ err }, "idle database connection error"));
redis?.on("error", (err) => app.log.warn({ err }, "redis connection error"));
worker.on("failed", (job, err) => log.warn(...));
process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
```

**Critical Node rule:** an `"error"` event with no listener **crashes the process**. That's why every pool and Redis client gets a listener (this was a real bug, see [BUGS_AND_FIXES.md](../08_BUGS_AND_DEBUGGING/BUGS_AND_FIXES.md)).

## CPU work blocks everyone

Argon2 hashing is deliberately slow, but `@node-rs/argon2` runs it in native code off the main JavaScript thread, so other requests continue meanwhile. CPU spent in JavaScript itself (building SQL strings, serialising JSON) does block the loop; Phase 9 found Drizzle's SQL building at 22% of API CPU, which is why caching whole responses helped. The **event-loop delay** metric in the lab dashboard measures exactly this.

## Async on the frontend: TanStack Query

Components never call `fetch` directly. `useQuery` returns `{ data, isPending, isError, error }` and re-renders when the promise settles; `useMutation` provides `mutate(input, { onSuccess, onError })`. Their states drive what the UI shows: "Loading…", the error message, or the content.

## Background processing (lab)

The BullMQ worker is a separate Node process consuming jobs from Redis with `concurrency: 5` (up to five emails in flight). The API only _enqueues_ (`emailQueue.add`), which is fast, and the slow SMTP conversation happens elsewhere.
