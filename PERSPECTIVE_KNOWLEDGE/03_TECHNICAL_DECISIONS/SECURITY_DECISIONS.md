# Security Decisions

The mechanisms themselves are taught in [07_SECURITY](../07_SECURITY/SECURITY_OVERVIEW.md). This page records the choices and their trade-offs.

---

## S1. CSRF: SameSite=Lax + Origin check + JSON-only (D30)

- **Problem:** browsers attach cookies automatically, so another website could make your browser send a request to our API carrying _your_ session (cross-site request forgery).
- **Chosen:** three independent layers:
  1. The `SameSite=Lax` cookie isn't sent on cross-site POST/PUT/DELETE.
  2. `checkOrigin` refuses any non-GET request whose `Origin` header isn't exactly `WEB_ORIGIN`. Browsers always send `Origin` on cross-site writes, and page scripts can't forge it.
  3. The `text/plain` body parser is removed, so only `application/json` bodies are accepted. A plain HTML form can only send `text/plain`, `multipart/form-data` or `x-www-form-urlencoded` without asking permission; sending JSON cross-site forces a CORS preflight, which our CORS config refuses.
- **Alternative:** synchronizer CSRF tokens (the server issues a token, the page echoes it in a header).
- **Why not tokens:** extra state to fetch and send on every request, and more code to get wrong. The three layers cover the same attacks for modern browsers.
- **Requirement this creates:** all state changes must use non-GET methods. They do: GET routes never modify data. (Session renewal on a GET is an internal side effect, not a user action.)

---

## S2. Proxy secret instead of IP allowlisting (D58, D61)

- **Problem:** the API must know the real visitor IP (for rate limits and session records), but `X-Forwarded-For` can be faked by anyone who calls the API directly.
- **Chosen:** Vercel adds `x-origin-secret`; the API refuses requests without it (except health checks) and then trusts `X-Forwarded-For` completely.
- **Alternatives:** trust a list of proxy IP ranges (`TRUST_PROXY`, still used in Docker setups with `uniquelocal`); a hop count.
- **Why not an IP list in production:** Vercel's outgoing IPs aren't a small fixed set on the free plan. **Why not a hop count:** it can't tell a real proxy from an attacker adding a fake hop, and Fastify no longer honours numeric hop counts (found during Phase 9).
- **Hardening details:** the secret is ≥32 chars (Zod); comparison is constant-time; `TRUST_PROXY` and `ORIGIN_SECRET` can't both be set (`env.ts:61`).

---

## S3. Rate limits: per route, in memory or Redis, fail open (D68)

- Limits are opt-in per route (`global: false`), with numbers chosen per action (login 10/15 min, register 5/h, forgot 5/h, reset 10/h, verify-send 3/15 min, Google start/callback 30/15 min, Google complete 10/h, stance 30/h, post edit 30/h, votes 120/h, comments 60/h).
- **Daily content limits are separate and counted in Postgres** (5 questions, 10 posts, 5 challenges, 100 comments, 20 reports per day): they survive restarts and hold across instances.
- **Fail open:** with Redis down, request-rate limits are skipped (`skipOnError: true`) rather than blocking every login. The Postgres daily limits still apply. **Trade-off:** availability over strictness during a Redis outage.

---

## S4. Sanitise rendered Markdown in the browser with an allowlist (D42)

- **Chosen:** store Markdown; render with `marked`; sanitise with DOMPurify, allowing only formatting tags plus `a[href,title]`; force `rel="noopener noreferrer nofollow ugc"` and `target="_blank"` on links; **no images**.
- **Why an allowlist:** even if `marked` had a bug that produced `<script>`, DOMPurify removes everything not explicitly allowed.
- **Why no images:** loading an image from another server tells that server who viewed the page (IP, time): a tracking pixel.
- **`nofollow ugc`:** tells search engines not to pass ranking credit to user links, which removes the SEO incentive for spam.
- **Trade-off:** sanitising in the browser means any _other_ client of the API must sanitise too. Today there is only one client.

---

## S5. Append-only audit log at the database level (D52)

`REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM perspective_app`. Even full control of the API process can't rewrite moderation history. Tested: `moderation.test.ts:380` ("can't be edited or deleted by the app's database role").

---

## S6. Secrets only in the environment; validated, never logged

- `.env` is gitignored; `.env.example` documents the names; hosts store real values; `render.yaml` uses `sync: false`.
- `env.ts` prints _which_ variable is invalid, never its value.
- Pino redacts cookies, authorization headers, `set-cookie`, and any `password`/`token` field; URLs have `code`/`state`/`token` query values replaced; email addresses are masked (`s***@example.com`).
- **Deliberate exception:** in development without SMTP, the mailer prints the full email text, including the link, so you can click it. Production refuses to start without SMTP, so this never happens there.

---

## S7. Least privilege in containers and the database

- The API container runs as the `node` user; the web image uses the unprivileged nginx variant.
- The running server never has migrator credentials (D57).
- Local ports are bound to `127.0.0.1` only.
- CI's `GITHUB_TOKEN` is read-only (`permissions: contents: read`).

---

## S8. Supply-chain hygiene

- `pnpm audit --audit-level high` fails CI on high-severity advisories.
- Dependabot opens weekly grouped PRs; major Node/`@types/node` bumps are ignored on purpose (stay on Node 22 LTS).
- `pnpm-workspace.yaml` `allowBuilds` lets only `esbuild` run an install script.
- `overrides` force patched versions of transitive dependencies with known advisories.
- pnpm's release-age policy refuses packages published too recently (protection against a hijacked release being pulled instantly).
- **Known accepted advisory:** a moderate `minimatch` advisory via `@fastify/otel`. The fix needs a much newer major release that also needs OpenTelemetry 3.x. It only affects the lab-only tracing package, and CI fails only on _high_, so it was left in place.

---

## S9. Not done (yet): Content-Security-Policy on the website

**FACT:** helmet's CSP applies to API JSON responses. The HTML served by Vercel has **no CSP header** (checked live). **RECOMMENDATION:** add a `Content-Security-Policy` header for all paths in `vercel.json` (e.g. `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self' <wake url>`). It would be a second layer if a sanitiser bug ever let a script through. See [SECURITY_TRADEOFFS.md](../07_SECURITY/SECURITY_TRADEOFFS.md).
