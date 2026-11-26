# Current Project Status

Snapshot of November 2026, at commit `cdd117f` ("fit the front page hero between the header and artwork on short windows"), which is pushed to `main` on GitHub.

## In one paragraph

All ten roadmap phases (0–9) are complete. The full product is live at **https://perspective-lilac.vercel.app** on a $0 hosting stack (Vercel + Render + Neon + Brevo). Google sign-in is implemented and tested, but **switched off in production** because no Google OAuth client is configured there. The Phase 9 scaling features (Redis cache, queue, replica, metrics, tracing) exist in the code but run **only in the local load-testing lab**; production runs without Redis, exactly as before Phase 9. Three optional Phase 8 items remain open: a custom domain, longer-term backups, and error monitoring.

## Roadmap phases

| Phase | Name                      | Status                       | Notes                                                        |
| ----- | ------------------------- | ---------------------------- | ------------------------------------------------------------ |
| 0     | Foundation                | ✅                           |                                                              |
| 1     | Authentication            | ✅                           | Google sign-in off in production (config only)               |
| 2     | Questions                 | ✅                           |                                                              |
| 3     | Stances and posts         | ✅                           |                                                              |
| 4     | Helpful votes and ranking | ✅                           |                                                              |
| 5     | Challenges and threads    | ✅                           |                                                              |
| 6     | Moderation                | ✅                           |                                                              |
| 7     | Testing                   | ✅                           |                                                              |
| 8     | Deployment                | ✅ core, ⬜ 3 optional items | Custom domain, backups beyond 6 h, error monitoring          |
| 9     | Scalability               | ✅                           | All lab experiments done and written up in `docs/SCALING.md` |

## What is live (checked with read-only requests)

| Check                                 | Result                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET /api/health/ready`               | `{"status":"ok"}`: the API is up and can reach Neon                                                |
| `GET /api/auth/providers`             | `{"google":false}`: Google sign-in is off                                                          |
| `GET /api/questions`                  | Returns real questions with stance counts and post counts                                          |
| Website response headers              | `Strict-Transport-Security` (Vercel), no Content-Security-Policy                                   |
| API response headers (through `/api`) | `Cache-Control: no-store`, helmet's `Content-Security-Policy`, `X-Frame-Options: SAMEORIGIN`, HSTS |

**HISTORY (from the deployment session):** the owner signed up on the live site, received the verification email through Brevo, and confirmed the link worked. The session-IP check from `docs/DEPLOYMENT.md` was run in Neon's SQL editor and showed the owner's own public IP (after comparing it with the address an IP-lookup site reported, the owner confirmed they were the same), which shows that the `ORIGIN_SECRET` and trusted-proxy setup passes the real visitor address through.

## Production configuration (what is and isn't switched on)

| Setting                                          | Production value                             | Effect                                                          |
| ------------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------- |
| `NODE_ENV`                                       | `production` (from the Dockerfile)           | Secure cookies; SMTP required at startup                        |
| `ORIGIN_SECRET`                                  | set (Render + Vercel)                        | Requests that skip the Vercel proxy are refused                 |
| `TRUST_PROXY`                                    | unset (must be, when `ORIGIN_SECRET` is set) | `env.ts:61` forbids setting both                                |
| `SMTP_URL`                                       | Brevo, port 2525                             | Real emails                                                     |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`      | unset                                        | Google button hidden; `/auth/google/start` answers 404          |
| `REDIS_URL`                                      | unset                                        | No cache, in-memory rate limits, emails sent during the request |
| `DATABASE_REPLICA_URL`, `METRICS_PORT`, `OTEL_*` | unset                                        | No replica, no metrics port, no tracing                         |

## Open items

### From the roadmap

- [ ] **Custom domain.** Needs a domain (e.g. from the GitHub Student Pack). It would also let Brevo authenticate the sending domain (SPF/DKIM/DMARC), so emails stop landing in spam.
- [ ] **Backups beyond Neon's free 6-hour history**, with a tested restore. Needs private storage for dumps. A public repository's CI artifacts are not private.
- [ ] **Error monitoring** beyond the Render and Vercel logs.
- [ ] Security checklist line "HTTPS everywhere in production; automated database backups, with a tested restore" is still unticked. HTTPS _is_ done (Vercel and Render certificates, HSTS); the backup half is what keeps the box open.

### Found while writing this knowledge base (RECOMMENDATIONS, not bugs that break anything)

These are listed in full, with reasoning, in [KNOWN_LIMITATIONS.md](../08_BUGS_AND_DEBUGGING/KNOWN_LIMITATIONS.md). The short version:

1. **`README.md` status line is out of date.** It says "Phases 0–7 complete"; phases 8 and 9 are also complete.
2. **Unban has no rank check.** `POST /moderation/users/:username/ban` refuses targets ranked at or above the moderator (`moderation/routes.ts:238`), but `/unban` (`:262`) has no such check, so a moderator can lift a ban that an admin placed.
3. **No Content-Security-Policy on the website's HTML.** XSS protection for user content relies on React's escaping plus DOMPurify, which is solid, but a CSP header in `vercel.json` would be a second layer.
4. **Missing account features:** change password while logged in, delete account, log out other devices.
5. **`question_status = 'pending'`** exists in the schema but nothing uses it yet (D37 kept it for a future review-first mode).
6. **`docs/DEPLOYMENT.md` step 4** has one table row (`ENABLE_EXPERIMENTAL_COREPACK`) that sits outside its table, so it renders as plain text.

### Dependabot

**HISTORY:** after the first push, Dependabot opened nine pull requests. The owner closed #3, #6 and #9 (major Node and TypeScript bumps that the project deliberately avoids). The others (#1, #2, #4, #5, #7, #10) were left open at the time of this snapshot.

## Test suite size (counted in the source)

| Suite                   | Test definitions              | Runs against                     |
| ----------------------- | ----------------------------- | -------------------------------- |
| API integration + unit  | 161 `it(...)`                 | real `perspective_test` database |
| Shared validation       | 13 (more cases via `it.each`) | pure functions                   |
| Web unit                | 9                             | jsdom                            |
| End-to-end (Playwright) | 13                            | real browser, API, database      |

**HISTORY:** at the end of Phase 7, API line coverage was about 91%.

## Learning tour progress

Module 1 (setup), lessons 1–4, and Module 2 (database), lessons 1–2, were completed; the next lesson would continue Module 2 or start Module 3 (API skeleton: `env.ts`, `db/client.ts`). See [MODULE_BY_MODULE_STUDY_GUIDE.md](../10_LEARNING_ROADMAP/MODULE_BY_MODULE_STUDY_GUIDE.md).
