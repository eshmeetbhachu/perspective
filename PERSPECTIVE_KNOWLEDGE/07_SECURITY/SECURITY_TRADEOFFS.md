# Security Trade-offs and Recommended Improvements

## Trade-offs that were made deliberately

| Trade-off                                           | Gained                                   | Given up                                                     | Decision |
| --------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------ | -------- |
| Sign-up says "email taken"                          | Clear sign-up flow                       | Account enumeration (rate-limited)                           | D31      |
| Rate limits fail open when Redis is down (lab)      | Logins keep working                      | No request-rate limits during the outage                     | D68      |
| CSRF via SameSite + Origin + JSON instead of tokens | Simplicity                               | Depends on modern browser behaviour                          | D30      |
| Markdown sanitised in the browser                   | Lossless editing; rules can change later | Every client must sanitise                                   | D42      |
| Questions publish without review                    | No moderator bottleneck                  | Spam visible until reported (limits + checks reduce it)      | D37      |
| Soft-flag suspicious content instead of blocking    | Fewer false positives                    | Some spam stays up until reviewed                            | D51      |
| Session lookup per request                          | Instant revocation                       | One DB query per request (0.06 ms)                           | D12, D68 |
| Dev mailer prints full links in the log             | Easy local testing                       | Must never be used in production (enforced by startup check) | D59      |
| Free hosting                                        | $0                                       | No backups beyond 6 h; shared infrastructure; cold starts    | D63      |

## Gaps found while writing this knowledge base (RECOMMENDATIONS)

Ordered by importance.

### 1. Backups

Neon free keeps 6 hours of history and no scheduled backups. **Risk:** an accidental delete or a bad migration noticed later is unrecoverable. **Fix:** a scheduled `pg_dump` (using a read-only role) to private storage, plus a restore rehearsal. This is the open Phase 8 item.

### 2. Content-Security-Policy for the website

The HTML pages have no CSP. **Risk:** if a sanitiser bug ever let HTML through, nothing would stop script execution. **Fix:** a `headers` entry in `vercel.json` for `/(.*)`, starting from:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
font-src 'self'; connect-src 'self' https://perspective-api.onrender.com; frame-ancestors 'none';
base-uri 'self'; form-action 'self'
```

(`connect-src` must include the wake URL host. Verify Vite's production output needs no inline scripts.) Roll out with `Content-Security-Policy-Report-Only` first.

### 3. Unban rank check

`unban` doesn't compare ranks the way `ban` does. **Risk:** a moderator could lift an admin's ban, including on another moderator. **Fix:** mirror the `ROLE_RANK` check, ideally against the rank of whoever placed the ban (from `audit_log`).

### 4. Per-account login throttling

Limits are per IP. **Risk:** a slow attack spread over many IPs against one account. **Fix:** count failed logins per account (in Postgres or Redis) with growing delays; notify the owner.

### 5. Session management

**Fix:** a page listing sessions (device, IP, last used) with "log out other devices"; delete expired sessions periodically.

### 6. Account deletion and data export

Users can't delete their accounts. **Fix:** an endpoint that deletes the user in a transaction, adjusts counters for their votes and stances (see [DATABASE_DESIGN_TRADEOFFS.md](../05_DATABASE/DATABASE_DESIGN_TRADEOFFS.md)), and optionally scrubs their soft-deleted content.

### 7. Website security headers

Beyond CSP: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, set in `vercel.json` (Vercel adds HSTS itself).

### 8. Ranking manipulation by false stances

The known product weakness (stated in the roadmap). Mitigated by cooldowns and account age, not solved. Ideas: weight by account age or reputation; detect accounts whose votes always favour one side.

### 9. Error monitoring

Errors are only visible in Render's logs. **Fix:** an error tracker (e.g. Sentry's free tier), configured to scrub cookies and request bodies.

### 10. Dependency advisories

One moderate advisory (`minimatch` via the lab-only `@fastify/otel`) is accepted. Revisit when upgrading OpenTelemetry.
