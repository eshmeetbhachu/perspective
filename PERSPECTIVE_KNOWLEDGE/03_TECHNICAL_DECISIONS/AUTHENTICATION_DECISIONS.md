# Authentication Decisions

How authentication works is in [AUTHENTICATION_ARCHITECTURE.md](../01_ARCHITECTURE/AUTHENTICATION_ARCHITECTURE.md). This page explains the choices.

---

## AU1. Server-side sessions in an httpOnly cookie, not JWTs (D12)

- **Problem:** after login, every request must prove who sent it.
- **Chosen:** a random token in a cookie; its SHA-256 in `sessions`; the user (with role and ban status) looked up on every request.

| Property                        | Session cookie (chosen)                                                  | JWT in localStorage                                                                       |
| ------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Can JavaScript read it?         | No (`httpOnly`)                                                          | Yes, so any XSS bug can steal it and use it from anywhere                                 |
| Logout / ban / password reset   | Delete the row: effective on the next request                            | The token stays valid until it expires (needs a denylist, which is a session table again) |
| Role change                     | Read fresh every request (D36)                                           | Baked into the token until it expires                                                     |
| Cost per request                | One indexed query (measured 0.06 ms, D68)                                | A signature check, no DB                                                                  |
| Works across many API instances | Yes, Postgres is shared                                                  | Yes                                                                                       |
| CSRF exposure                   | The browser sends cookies automatically, so CSRF defence is needed (AU6) | None, because the header is added by script                                               |

- **Why the trade-off favours sessions here:** instant revocation is a security feature (bans, compromised accounts), and the DB lookup is negligible. JWTs shine across many independent services, which this project doesn't have.
- **Still appropriate?** Yes. Phase 9 considered moving sessions to Redis and rejected it: 0.06 ms per lookup wasn't worth the risk (D68).

---

## AU2. Store only hashes of tokens

Sessions, pending Google sign-ins and email links all store `sha256(token)`. A stolen database backup or a SQL injection that reads `sessions` can't produce a working cookie. A fast hash is enough because the tokens have 256 bits of randomness, far beyond guessing.

---

## AU3. argon2id with OWASP minimum parameters

`memoryCost: 19_456` (19 MiB), `timeCost: 2`, `parallelism: 1` (`passwords.ts:4`).

- **Memory-hard:** each guess needs 19 MiB of RAM, which makes massive parallel guessing on GPUs expensive.
- **Cost to us:** tens of milliseconds per login, which is fine. Login is rate-limited anyway.
- **Password policy:** at least 12 characters and at most 128, with no composition rules (NIST guidance: length beats "one symbol, one digit"; the maximum stops huge inputs from making hashing expensive). Login doesn't apply the 12-character rule, so older or differently-created passwords still work.

---

## AU4. Equal answers for unknown email and wrong password

- `Wrong email or password` for both, and `verifyAgainstDummy()` spends the same hashing time when the email doesn't exist.
- **Why:** otherwise an attacker learns which emails have accounts (account enumeration), from the message or from the response time.
- **Accepted exception (D31):** sign-up _does_ say "email taken" / "username taken". Hiding it would need an email-only sign-up flow ("check your inbox to continue"), which hurts usability. Sign-up is limited to 5 per hour per IP, so mass enumeration is slow.
- **Forgot password** always answers 204, whether or not the account exists.

---

## AU5. Google sign-in via OpenID Connect, with no email-based auto-linking (D24, D27, D34)

- **Why offer Google at all:** users expect it, and it skips email verification (Google vouches for `email_verified`).
- **Why also keep passwords:** not everyone has or wants Google; it avoids depending on one provider; and it teaches password security.
- **Why openid-client:** a certified library verifies state, PKCE, nonce and the ID token's signature, issuer, audience and expiry. Hand-rolled OAuth code is a classic source of security holes.
- **Why match on `sub`, never email:** an email address can change owners; Google's `sub` is a stable, unique id for the account.
- **Why no auto-linking:** pre-account takeover (see [AUTHENTICATION_ARCHITECTURE.md](../01_ARCHITECTURE/AUTHENTICATION_ARCHITECTURE.md#sign-in-methods)). The owner set this rule explicitly at the start of Phase 1.
- **Why a server-side pending record:** after Google returns, the user still needs a step (pick a username, or prove they own the existing account). The verified identity is kept on the server for 15 minutes, keyed by a hashed cookie token, so nothing the browser sends back can alter it.
- **Status:** implemented and tested; **off in production** (no Google client configured).

---

## AU6. CSRF defence without tokens (D30)

See [SECURITY_DECISIONS.md](SECURITY_DECISIONS.md#s1-csrf-samesitelax--origin-check--json-only-d30).

---

## AU7. Email links: hashed, single-use, POST-to-consume (D35)

- **One table** (`email_tokens`) with a `purpose` for both link types.
- **A new link cancels older ones** (delete + insert in one transaction), so only the latest email works.
- **Single use via one statement:** `DELETE ... WHERE token_hash = $1 AND expires_at > now() RETURNING user_id`. Two simultaneous clicks: only one gets the row back. A separate `SELECT` then `DELETE` would let both succeed.
- **The link opens a page that POSTs the token.** Email security scanners "click" (GET) links to inspect them; if a GET verified the email or consumed the reset token, the scanner would use it up.
- **Lifetimes:** verification 24 h, reset 30 min (a reset link is more dangerous if leaked).
- **A reset also verifies the email** (it proves control of the inbox) and **ends every session** (the reset may follow a compromise).

---

## AU8. Roles: three ranked roles, read per request, changed by CLI (D36)

- `user < moderator < admin`; `requireRole("moderator")` admits admins.
- **No role-management UI** yet: `pnpm set-role`. Fewer screens that can grant power means less attack surface.
- **Rank rule for bans:** a moderator can only ban users ranked strictly below them, and nobody can ban themselves.

---

## AU9. Verified email required for writing, not for reading or taking a side

Asking, posting, voting, challenging and commenting need a verified email; declaring a stance and reporting only need a login. **(Reconstructed reasoning:)** verification stops throwaway accounts from creating content; a stance on its own isn't visible content, and you need one before you can do anything else, so it shouldn't block onboarding. Voting additionally needs a 24-hour-old account (D45), the cheapest defence against "create account, vote, discard".
