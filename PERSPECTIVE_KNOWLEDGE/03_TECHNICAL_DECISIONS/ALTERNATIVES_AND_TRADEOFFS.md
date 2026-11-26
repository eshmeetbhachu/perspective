# Alternatives and Trade-offs: All Decisions at a Glance

Every Decision Log entry (D1–D75), grouped, with the alternative that was rejected, the cost that was accepted, and a verdict on whether it still fits. Verdicts are **RECOMMENDATIONS** from reviewing the code in November 2026.

## Product rules

| D        | Decision                                                                          | Rejected alternative                 | Cost accepted                                                                  | Still fits?                                                                                           |
| -------- | --------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| D3       | Topics are yes/no-style questions                                                 | Free-form topics                     | Some topics need rephrasing                                                    | ✅                                                                                                    |
| D4       | Author's stance stored on the post                                                | Infer from the column clicked        | n/a                                                                            | ✅                                                                                                    |
| D5       | Reader's stance per (user, question)                                              | Stance per post or per vote          | One stance per question                                                        | ✅                                                                                                    |
| D6       | Stance required before voting                                                     | Votes without a stance               | Small onboarding step                                                          | ✅ needed for weights                                                                                 |
| D7       | Vote stores the voter's stance snapshot                                           | Recompute from current stance        | Extra column per vote                                                          | ✅                                                                                                    |
| D8, D43  | Stance changes allowed once per 24 h, incl. after the first declaration; row lock | Unlimited changes; no changes        | A UI confirmation step                                                         | ✅                                                                                                    |
| D9       | Only positive votes                                                               | Up/down votes                        | Bad content handled by reports only                                            | ✅ core identity                                                                                      |
| D10, D44 | Cross-side weighting 1/2/3                                                        | Equal votes                          | **Known weakness:** someone can declare a false stance to boost their own side | ⚠️ acceptable; listed as future work                                                                  |
| D37      | Verified users publish questions immediately, 5/day                               | Pre-approval queue                   | Spam reaches the site before review; mitigated by limits and reports           | ✅ while traffic is small; `pending` status ready                                                     |
| D41      | One live post per side; post stays in its original column                         | Many posts per side                  | People must edit to improve                                                    | ✅                                                                                                    |
| D45      | 24 h account age to vote                                                          | Delayed vote recording (needs a job) | New users wait a day                                                           | ✅                                                                                                    |
| D47      | One challenge per person per post, 5/day, needs verification                      | Unlimited challenges                 | Follow-ups go into the thread                                                  | ✅                                                                                                    |
| D48      | 5 levels per page, max depth 50, no comment edits                                 | Unlimited depth; edits               | No editing yet                                                                 | ✅ (edits are future work)                                                                            |
| D49      | Notifications in the same transaction; polled every 60 s                          | WebSockets / push; a queue           | Up to 60 s delay; one small query per tab per minute                           | ✅                                                                                                    |
| D50      | Reports by (type, id); removal separate from deletion; rank-limited bans          | FK per type; hard deletes            | No FK on the target                                                            | ✅ — but see the unban rank gap in [KNOWN_LIMITATIONS](../08_BUGS_AND_DEBUGGING/KNOWN_LIMITATIONS.md) |
| D51      | Duplicates refused; soft signals flagged                                          | Block on all signals; ML spam filter | Some spam reaches the queue instead of being blocked                           | ✅                                                                                                    |

## Architecture and code

| D                  | Decision                                          | Rejected alternative               | Cost accepted                                          | Still fits?                           |
| ------------------ | ------------------------------------------------- | ---------------------------------- | ------------------------------------------------------ | ------------------------------------- |
| D1                 | TypeScript everywhere                             | JS; another backend language       | Compile/type tooling                                   | ✅                                    |
| D13                | Modular monolith                                  | Microservices                      | All features scale together                            | ✅ (measured)                         |
| D14, D38, D46, D74 | Keyset cursors                                    | Offset paging                      | No page numbers                                        | ✅                                    |
| D16                | `@perspective/*` scope, final name up front       | Rename later                       | none                                                   | ✅                                    |
| D17                | Shared package as TS source                       | Built package                      | API must be bundled                                    | ✅                                    |
| D18                | TypeScript 6.0 for type-aware lint                | TS 7                               | Slower type-checks                                     | ✅ until typescript-eslint supports 7 |
| D20                | Zod everywhere                                    | TypeBox                            | ~2% CPU (measured)                                     | ✅                                    |
| D21                | One root `.env`, Node `--env-file`                | dotenv, per-app files              | none                                                   | ✅                                    |
| D22                | Custom error contract                             | RFC 9457                           | Non-standard                                           | ✅                                    |
| D23 → D29          | Plain commit messages (no hooks)                  | Conventional Commits + commitlint  | none                                                   | ✅ owner preference                   |
| D33, D56           | One origin via proxies                            | Separate API domain + CORS         | Proxy hop and timeout                                  | ✅                                    |
| D42                | Markdown + DOMPurify allowlist in the browser     | Store HTML; sanitise on the server | Every client must sanitise                             | ✅ (add CSP)                          |
| D53                | Three test layers; E2E creates sessions in the DB | E2E through the sign-up UI         | Less UI coverage of sign-up (one spec still covers it) | ✅                                    |
| D54                | Curated seed text, backdated UUIDv7               | Faker                              | Less variety                                           | ✅                                    |
| D55, D75           | Light theme only; landing page + browse page      | Dark mode; list on the homepage    | No dark mode                                           | ✅ design choice                      |

## Data

| D        | Decision                                 | Rejected alternative              | Cost accepted                                  | Still fits?       |
| -------- | ---------------------------------------- | --------------------------------- | ---------------------------------------------- | ----------------- |
| D2       | PostgreSQL                               | MongoDB, MySQL                    | Running a server                               | ✅                |
| D11      | Adjacency list + recursive CTE           | Nested sets, closure table, paths | Recursive query                                | ✅                |
| D15      | Soft deletes                             | Hard deletes                      | Filters everywhere; data grows                 | ✅                |
| D19, D52 | Two roles; append-only audit             | One superuser                     | Two URLs                                       | ✅                |
| D26      | UUIDv7                                   | bigserial, UUIDv4                 | 16-byte keys                                   | ✅                |
| D28      | Lower-case unique indexes                | citext                            | Queries must use `lower()`                     | ✅                |
| D35      | One email-token table, DELETE…RETURNING  | Separate tables; JWT links        | none                                           | ✅                |
| D39      | tsvector + GIN; trigrams for suggestions | Search engine                     | Limited typo tolerance in search               | ✅ (D72 measured) |
| D40      | Unicode slugs, never change              | ASCII-only; editable slugs        | Titles can't be renamed without breaking links | ✅                |
| D66      | Partial indexes match the filter exactly | Generic partial indexes           | Must keep code and index in sync               | ✅                |
| D74      | Stored stance counters                   | Counting on read                  | Write-path work                                | ✅                |

## Security and auth

| D        | Decision                                                        | Rejected alternative      | Cost accepted                       | Still fits?             |
| -------- | --------------------------------------------------------------- | ------------------------- | ----------------------------------- | ----------------------- |
| D12      | Session cookies                                                 | JWT in localStorage       | DB lookup per request               | ✅                      |
| D24      | Google + passwords                                              | One method only           | Two flows to secure                 | ✅ (Google off in prod) |
| D25      | Auth built in a fixed order                                     | Big bang                  | none                                | n/a (historical)        |
| D27, D34 | No auto-linking; pending record; openid-client                  | Link by email             | Extra step for users                | ✅ essential            |
| D30      | SameSite + Origin + JSON-only                                   | CSRF tokens               | All writes must be non-GET          | ✅                      |
| D31      | Sign-up reveals taken emails                                    | Email-only sign-up flow   | Enumeration possible (rate-limited) | ✅                      |
| D32      | API tests on a real DB                                          | Mocks                     | Tests need Docker                   | ✅                      |
| D36      | Guards as preHandlers; roles read per request; CLI role changes | Roles in tokens; admin UI | No UI for roles                     | ✅                      |
| D58, D61 | Proxy secret; origin-normalised `WEB_ORIGIN`; `no-store`        | IP allowlist; hop count   | Shared secret to rotate             | ✅                      |
| D59      | SMTP via one URL; production requires it                        | Provider SDK              | none                                | ✅                      |

## Deployment and scaling

| D   | Decision                                                   | Rejected alternative              | Cost accepted                                     | Still fits?                                             |
| --- | ---------------------------------------------------------- | --------------------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| D57 | Migrate on container start + advisory lock                 | CI migration step                 | Startup waits for migrations                      | ✅                                                      |
| D60 | CI runs everything incl. E2E and Docker builds             | Lighter CI                        | ~minutes per push                                 | ✅                                                      |
| D62 | `db:setup-roles` for hosted DBs                            | Manual SQL                        | none                                              | ✅                                                      |
| D63 | Vercel + Render + Neon + Brevo, all free                   | Paid hosting; Koyeb; Netlify      | Cold starts; 6 h restore window; spam-folder risk | ✅ for a portfolio; ⚠️ backups needed before real users |
| D64 | Browser wakes the API; retry 502 for 2 min                 | Keep-alive pinger service         | Slow first visit                                  | ✅                                                      |
| D65 | Lab with fixed 1 CPU budget; medians                       | Single runs                       | Time                                              | ✅                                                      |
| D67 | Redis cache for logged-out GETs, version-key invalidation  | Delete keys on write; CDN caching | Extra service; long-tail misses                   | ✅ in lab; not needed in prod yet                       |
| D68 | Sessions stay in Postgres; rate limits in Redis, fail open | Sessions in Redis                 | Fail-open window                                  | ✅                                                      |
| D69 | nginx `least_conn`                                         | Round robin                       | none                                              | ✅                                                      |
| D70 | Emails via BullMQ; notifications/scores stay transactional | Queue everything                  | Shared Redis eviction caveat in the lab           | ✅                                                      |
| D71 | Replica + LSN read-your-writes                             | Always primary; sticky sessions   | Needs Redis                                       | ✅                                                      |
| D72 | No search engine yet                                       | Meilisearch                       | Search is ~1/4 of DB time                         | ✅ until ~40%                                           |
| D73 | Metrics always on in the lab; tracing opt-in               | Always-on tracing                 | Investigations need a restart with tracing        | ✅ (measured cost)                                      |
