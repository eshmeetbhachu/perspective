# Feature: Waking the Sleeping API (D64)

**Problem:** Render's free plan stops the API container after 15 minutes without traffic. Measured on the live site, while it's asleep:

- requests that arrive **through Vercel's proxy** get an immediate **502 Bad Gateway**, and **do not** start the service;
- a **direct** request to the Render URL **does** start it, which takes about 30–60 seconds (42 s measured).

Without a fix, the first visitor after a quiet period would see a broken site.

## The solution, in two parts (`apps/web/src/api.ts`)

### 1. Ping Render directly on page load

```ts
export function wakeApi(): void {
  const url = import.meta.env.VITE_API_WAKE_URL; // https://<render>/health
  if (url) fetch(url, { mode: "no-cors" }).catch(() => undefined);
}
```

`main.tsx` calls `wakeApi()` before React even renders, so the API starts waking while the page loads.

- **`mode: "no-cors"`:** the request goes to another origin (Render), and the page doesn't need to read the answer, only to cause it. A `no-cors` request can be sent without the server allowing CORS; the response is opaque (unreadable), which is fine here.
- `/health` is exempt from the `ORIGIN_SECRET` check, so the direct request is allowed. It's also cheap: it doesn't touch the database.
- `.catch(() => undefined)` ignores failures: this ping is best-effort.

### 2. Retry 502s for up to two minutes

```ts
async function send(path, init) {
  const giveUpAt = Date.now() + 120_000;
  for (;;) {
    const response = await fetch(`/api${path}`, init);
    if (
      response.status !== 502 ||
      !import.meta.env.VITE_API_WAKE_URL ||
      Date.now() > giveUpAt
    ) {
      return response;
    }
    wakeApi();
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
}
```

- **Only 502 is retried,** because a 502 from the proxy means the request never reached the API, so resending can't run anything twice (no double posts, no double votes). Other errors (500, 404, 429) are returned immediately.
- It pings again on every retry, in case the first ping was lost.
- It gives up after 2 minutes, which comfortably covers the ~1-minute wake-up.
- `for (;;)` is an endless loop that exits through `return`.
- Without `VITE_API_WAKE_URL` (development, tests, local images) the loop never retries.

**Why Vercel matters here:** Vercel's proxy waits up to 120 s for an answer; Netlify's gives up after 26 s, so it couldn't have survived a cold start even with retries. That was one reason Vercel was chosen (D63).

## Rejected alternatives

| Alternative                                      | Why not                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| An external "keep-alive" pinger every 10 minutes | Another service to run; uses free instance-hours around the clock; some hosts consider it abuse |
| A paid always-on plan                            | The project's constraint was $0                                                                 |
| Show an error and ask the user to reload         | Bad first impression                                                                            |

## Configuration

`VITE_API_WAKE_URL` is set on Vercel for all environments. Because it starts with `VITE_`, Vite compiles it into the public JavaScript bundle. That's intended (the URL is public anyway); a secret must never use that prefix. Its type is declared in `vite-env.d.ts`.

## Tests

`apps/web/src/api.test.ts` stubs `fetch` and fake timers: it wakes the API directly and retries until it answers; it gives up after two minutes; it doesn't retry other errors.

## What the user experiences

The first visit after a quiet period shows "Loading…" for 30–60 seconds, then works. Neon's database also sleeps after 5 idle minutes, so the first query after that adds a little more delay.
