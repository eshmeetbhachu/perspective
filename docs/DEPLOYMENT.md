# Deploying Perspective ($0)

```
Browser ──► Vercel (web + /api proxy) ──► Render (API container) ──► Neon (Postgres 18)
                adds X-Origin-Secret          refuses requests            │
                                              without it                  └─► Brevo (email, SMTP :2525)
```

Every service below has a free plan that needs no payment card (checked
October 2026; free plans change, so re-check the limits before relying on
them). Order matters: each step needs a value from the one before.

## 1. Neon (database)

1. Create a project: **Postgres 18**, region **AWS Asia Pacific (Singapore)**
   (or whichever region is closest to you; Render must use the matching one).
2. **Compute** settings: set the maximum size to **0.25 CU**. The free plan
   includes 100 CU-hours a month; at 0.25 CU that is 400 hours of activity.
3. Copy the **direct** connection string (not the "pooled" one) of the owner
   role. In PowerShell, from the repository root:

   ```powershell
   $env:OWNER_DATABASE_URL = "<paste the owner connection string>"
   pnpm db:setup-roles
   Remove-Item Env:OWNER_DATABASE_URL
   ```

   It creates `perspective_migrator` and `perspective_app` (D19) and prints
   `DATABASE_URL` and `MIGRATION_DATABASE_URL` once. Keep them for step 3;
   don't save them in any file in the repository.

## 2. Brevo (email)

1. Create a free account, then **Senders → Add a sender** with the address
   emails should come from, and confirm it.
2. **SMTP & API → SMTP → Generate a new SMTP key.**
3. Build `SMTP_URL` from the login shown on that page (an email address; write
   its `@` as `%40`) and the key:
   `smtp://<login>%40<domain>:<smtp-key>@smtp-relay.brevo.com:2525`

Port 2525 matters: Render's free plan blocks the usual mail ports 25, 465 and 587. A personal address such as Gmail can't be authenticated by Brevo, which
then sends from a `brevosend.com` address instead; mail may land in spam until
you use a domain you own (see "Later").

## 3. Render (API)

1. Make a long random secret, used by both Render and Vercel:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. **New → Blueprint**, pick the GitHub repository. Render reads `render.yaml`
   and asks for each value:

   | Variable                 | Value                                                        |
   | ------------------------ | ------------------------------------------------------------ |
   | `WEB_ORIGIN`             | `https://<vercel-project>.vercel.app` (fill in after step 4) |
   | `DATABASE_URL`           | from step 1                                                  |
   | `MIGRATION_DATABASE_URL` | from step 1                                                  |
   | `ORIGIN_SECRET`          | the secret from 3.1                                          |
   | `SMTP_URL`               | from step 2                                                  |
   | `EMAIL_FROM`             | `Perspective <the sender address from step 2>`               |
   | `GOOGLE_*`               | leave empty to keep Google sign-in off                       |

   `PORT` is set by Render; `NODE_ENV=production` and `HOST` come from the
   Dockerfile.

3. Note the service address, e.g. `https://perspective-api.onrender.com`.
   `https://<that address>/health` should answer `{"status":"ok"}`.

## 4. Vercel (website)

1. **Add New → Project**, import the repository, set **Root Directory** to
   `apps/web` (framework: Vite).
2. Environment variables, scoped to **Production only** (so preview
   deployments of branches can't reach the real API):

   | Variable            | Value                                             |
   | ------------------- | ------------------------------------------------- |
   | `API_ORIGIN`        | the Render address, no trailing slash             |
   | `ORIGIN_SECRET`     | the same secret as on Render                      |
   | `VITE_API_WAKE_URL` | the Render address + `/health` (all environments) |

| `ENABLE_EXPERIMENTAL_COREPACK` | `1` (makes Vercel use pnpm 12 from `package.json`) |

3. Deploy, then put the final `https://<project>.vercel.app` into Render's
   `WEB_ORIGIN` and redeploy the API.

## 5. Check it

- Sign up on the live site and confirm the email arrives.
- The first visit after 15 idle minutes takes about 30-60 seconds (measured: 42 s). Render
  doesn't wake the API for requests that arrive through Vercel (it answers
  502 at once), so the website pings `VITE_API_WAKE_URL` directly and retries
  502s for up to two minutes (D64).
- In Neon's SQL editor, this should show your own public IP, not a Vercel or
  Render one:
  `select host(ip) from sessions order by created_at desc limit 1`

## Free plan limits (October 2026)

| Service | Limits that matter here                                                                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel  | Hobby: non-commercial use only; 100 GB transfer and 10 GB from the API ("origin transfer") a month                                                                                                                              |
| Render  | 512 MB RAM, 0.1 CPU; sleeps after 15 min without traffic, ~1 min to wake; 750 instance-hours a month; outbound mail ports blocked; over the bandwidth limit with no card, free services are suspended for the rest of the month |
| Neon    | 1 GB storage, 100 CU-hours and 5 GB transfer a month; sleeps after 5 idle minutes; restore only within the last 6 hours, 1 manual snapshot, no scheduled backups                                                                |
| Brevo   | 300 emails a day                                                                                                                                                                                                                |

## Later

- **Own domain** (e.g. from the GitHub Student Pack): authenticate it in Brevo
  (SPF/DKIM/DMARC) for reliable delivery, and add it to Vercel.
- **Backups:** the free Neon plan only keeps 6 hours of history. A longer-term
  backup needs somewhere private to store dumps; a public repository's CI
  artifacts are not private.
