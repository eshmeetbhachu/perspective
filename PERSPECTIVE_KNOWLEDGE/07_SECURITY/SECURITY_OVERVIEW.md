# Security Overview

**Only implemented mechanisms are described as facts.** Recommendations are labelled. The roadmap's Security Checklist (`docs/ROADMAP.md`) was followed "from the first line of auth code, not at the end".

## Threat model in one table

| Attacker wants to…                          | Defence (implemented)                                                                  | Doc                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Read passwords from a leaked database       | argon2id hashes                                                                        | [PASSWORD_SECURITY](PASSWORD_SECURITY.md)                                                           |
| Log in as someone from a leaked database    | Only token hashes stored                                                               | [COOKIE_SECURITY](COOKIE_SECURITY.md)                                                               |
| Guess passwords                             | Rate limits; 12-char minimum; slow hash                                                | [PASSWORD_SECURITY](PASSWORD_SECURITY.md)                                                           |
| Learn which emails have accounts            | Same message and timing on login; forgot always 204 (sign-up is an accepted exception) | [AUTHENTICATION_AND_AUTHORIZATION](AUTHENTICATION_AND_AUTHORIZATION.md)                             |
| Steal a session cookie with injected script | `httpOnly`; sanitized Markdown; React escaping                                         | [CSRF_CORS_AND_XSS](CSRF_CORS_AND_XSS.md)                                                           |
| Make your browser act for them (CSRF)       | SameSite=Lax + Origin check + JSON-only                                                | [CSRF_CORS_AND_XSS](CSRF_CORS_AND_XSS.md)                                                           |
| Read API responses from their own site      | Strict CORS (only `WEB_ORIGIN`)                                                        | [CSRF_CORS_AND_XSS](CSRF_CORS_AND_XSS.md)                                                           |
| Take over an account through Google         | No email-based auto-linking; verified Google emails only; matched by `sub`             | [OAUTH_FLOW](OAUTH_FLOW.md)                                                                         |
| Tamper with the OAuth flow                  | state + PKCE + nonce + ID-token verification (openid-client)                           | [OAUTH_FLOW](OAUTH_FLOW.md)                                                                         |
| SQL injection                               | Parameterised queries only; least-privilege DB role                                    | [SQL_CONCEPTS_USED](../05_DATABASE/SQL_CONCEPTS_USED.md#parameterised-queries-sql-injection-safety) |
| Do things they aren't allowed to            | Server-side guards on every route; ownership checks; roles read per request            | [AUTHENTICATION_AND_AUTHORIZATION](AUTHENTICATION_AND_AUTHORIZATION.md)                             |
| Spoof their IP to dodge rate limits         | ORIGIN_SECRET; trusted proxies only                                                    | [SECURITY_DECISIONS](../03_TECHNICAL_DECISIONS/SECURITY_DECISIONS.md)                               |
| Flood the site                              | Rate limits + daily content limits; duplicate refusal; automated flags                 | [MODERATION](../04_FEATURE_DEEP_DIVES/MODERATION.md)                                                |
| Game the ranking                            | Verified email, 24 h account age, stance cooldown, no self-votes, one vote per post    | [VOTES_AND_RANKING](../04_FEATURE_DEEP_DIVES/VOTES_AND_RANKING.md)                                  |
| Erase evidence of moderation                | Audit log append-only at DB level                                                      | [MODERATION](../04_FEATURE_DEEP_DIVES/MODERATION.md)                                                |
| Find secrets in the repo, logs or errors    | `.env` gitignored; redacted logs; generic 500s; secrets only on hosts                  | [ENVIRONMENT_SECRETS](ENVIRONMENT_SECRETS.md)                                                       |
| Exploit a vulnerable dependency             | `pnpm audit` in CI (high); Dependabot; install-script allowlist; release-age policy    | [SECURITY_DECISIONS](../03_TECHNICAL_DECISIONS/SECURITY_DECISIONS.md#s8-supply-chain-hygiene)       |
| Get an open redirect after login            | `safeRedirect`                                                                         | [AUTHENTICATION_AND_AUTHORIZATION](AUTHENTICATION_AND_AUTHORIZATION.md)                             |
| Track readers with images in posts          | No `<img>` allowed                                                                     | [CSRF_CORS_AND_XSS](CSRF_CORS_AND_XSS.md)                                                           |
| Intercept traffic                           | HTTPS everywhere (Vercel, Render, Neon TLS); HSTS                                      | [INFRASTRUCTURE](../01_ARCHITECTURE/INFRASTRUCTURE_AND_DEPLOYMENT.md)                               |

## The Security Checklist status

| Item (from the roadmap)                                               | Status                                  |
| --------------------------------------------------------------------- | --------------------------------------- |
| argon2id passwords                                                    | ✅                                      |
| Session cookie httpOnly/Secure/SameSite=Lax; hashed; rotated on login | ✅                                      |
| CSRF protection on every state-changing request                       | ✅                                      |
| Every body/query/param validated with Zod                             | ✅                                      |
| Only parameterised queries                                            | ✅                                      |
| User content as plain text or sanitized Markdown                      | ✅                                      |
| Authorization on every write                                          | ✅                                      |
| Rate limits on login, register, reset, posting, voting                | ✅                                      |
| Helmet headers; strict CORS                                           | ✅ (API responses)                      |
| Email verification before posting or voting                           | ✅                                      |
| Reset tokens random, hashed, single-use, 30 min                       | ✅                                      |
| Generic login errors                                                  | ✅                                      |
| Google: state + PKCE + nonce; ID token verified; only verified emails | ✅                                      |
| No linking by email alone                                             | ✅                                      |
| Secrets only in env; `.env.example` committed                         | ✅                                      |
| Least-privilege DB user                                               | ✅                                      |
| Logs never contain passwords, tokens or full emails                   | ✅ (dev mailer prints links on purpose) |
| `pnpm audit` + Dependabot                                             | ✅                                      |
| HTTPS everywhere; automated backups with a tested restore             | HTTPS ✅, backups ⬜                    |

## Gaps and recommendations

See [SECURITY_TRADEOFFS.md](SECURITY_TRADEOFFS.md): no CSP on the website's HTML, unban without a rank check, no backups, no "log out other devices", no account deletion, no 2FA, and the stance-faking weakness in ranking.
