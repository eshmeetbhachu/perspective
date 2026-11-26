# Development Issues: The Bigger Problems

Not single bugs, but problems that changed the plan.

## 1. Free hosting that actually works together (Phase 8)

**Constraint (owner):** "I'm a student and I am not going to be able to pay any money … figure out ways to make it cost $0."

| Step | Finding                                                                               | Consequence                                                       |
| ---- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1    | First proposal: Netlify/Vercel + **Koyeb** (API) + Neon + Gmail SMTP                  |                                                                   |
| 2    | Koyeb's free plan was closed to new accounts                                          | API → **Render** free (Docker, no card)                           |
| 3    | Render sleeps after 15 min; waking takes ~1 min                                       | the proxy in front must wait that long                            |
| 4    | Netlify's proxy times out after 26 s; Vercel waits 120 s                              | website → **Vercel**                                              |
| 5    | Render's free plan blocks outbound ports 25, 465, 587                                 | email → **Brevo** on port **2525**                                |
| 6    | The Render URL is public, so anyone could bypass Vercel and fake `X-Forwarded-For`    | **ORIGIN_SECRET** header + trust only proxied requests (D61)      |
| 7    | Neon gives no superuser and runs no init scripts                                      | `pnpm db:setup-roles` (D62), tested against a non-superuser owner |
| 8    | Live test: proxied requests to a sleeping Render get an instant 502 and don't wake it | browser-side wake-up + 502 retry (D64)                            |
| 9    | Brevo can't authenticate a personal Gmail sender domain                               | mail may go to spam until a custom domain exists                  |

**Lesson:** free tiers each have hidden constraints (timeouts, blocked ports, sleep behaviour), and they interact. They were found by reading the limits _and_ by measuring the live system.

## 2. The learning gap at the start

After Phase 0 the owner said they had understood nothing so far and asked where the website would actually be built. The decision was to stick to the plan (foundations first), and the way explanations were written changed: big picture first, plain language, short. Later this grew into the 13-module learning tour and this knowledge base. **Lesson:** infrastructure-first projects feel abstract; show the end-to-end picture early.

## 3. Choosing Phase 9 vs Phase 8 order

The owner asked to do scaling (Phase 9) before deployment, then decided "do Phase 8 first". Deploying first meant the scaling work had to stay **off by default** so production never changed (every Phase 9 feature behind an env variable).

## 4. Measuring on a laptop (Phase 9)

- Identical runs varied ±50% at p95 (background apps, CPU boost, efficiency cores). **Response:** medians of repeated runs; judge each change by the number it targets (query time, CPU per request), not one end-to-end run (D65).
- Beyond 2 API instances the laptop itself was the limit (16 threads shared by everything). SCALING.md states this instead of presenting misleading "linear scaling" numbers.

## 5. Design iterations

- **October:** the front page and theme were rebuilt around the owner's artwork, then refitted for the owner's ~1998×985 screen.
- **November:** a full site redesign (landing page, browse page, phone tabs, split-screen auth), designed first as an artifact with six artboards, approved by the owner, then built. Then the hero overlap on short laptop windows.

**Lesson:** layouts sized in viewport units need checking across _real_ viewport shapes, including short-and-wide laptops with display scaling.

## 6. Keeping CI green with strict tooling

Type-aware lint, `prettier --check`, `pnpm audit --audit-level high`, E2E and Docker builds all run on every push, and Render deploys only after CI passes. The working agreement forbids silencing errors, disabling rules or weakening tests, so every failure had to be fixed at its cause (e.g. ignoring generated report files rather than turning lint rules off).
