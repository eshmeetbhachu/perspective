# Perspective

An opinion platform where people understand viewpoints before debating them. Questions are split into For / Neutral / Against, posts explain reasoning, and debate happens only inside Challenges.

The full plan (decision log, architecture, data model, security checklist, phases) is in @docs/ROADMAP.md. Treat it as the source of truth.

## Working agreement (most important)

I am building this project to learn, especially system design and scalability. I own the product and the major architectural decisions; Claude owns the implementation workflow within a phase.

- Work one phase at a time, in roadmap order. Implement the whole phase autonomously: break it into tasks, build, integrate, verify (typecheck, lint, format, tests, builds), fix, update docs, commit.
- Make routine engineering decisions independently, following the existing architecture and Decision Log. Log notable ones in the Decision Log with the reason.
- Stop and ask only for decisions that are significant and hard to reverse (anything marked 🟡), or that need credentials, external accounts, payment, or an action only I can do. If blocked, finish everything else in the phase and report the blocker.
- Don't add features outside the roadmap, or unnecessary dependencies and abstractions, without asking.
- After a phase: write a learning-oriented completion report (what we built, how it works, important files, decisions, concepts learned, verification, git), then STOP and wait for me to authorize the next phase.
- Tick off roadmap checkboxes as items are completed.
- If I ask "why", answer properly. Never just say "it's best practice".

## Git

- Claude may run `git add` and `git commit`. Never push, force-push, reset --hard, or rewrite history without asking.
- Commits use my existing git identity. No AI co-author trailers or attribution.
- Commit messages are short, plain descriptions (`add users and sessions tables`): no `feat:`-style prefixes, no emojis.
- Before committing: check status, review the staged diff, and make sure no secrets, `.env`, or unrelated changes are included.

## Code style

- Straightforward, human-looking code. No unnecessary files, wrappers, or abstractions.
- Comments are rare: at most a concise single line where it genuinely helps.
- Never silence type errors, disable lint rules, or weaken tests just to make a command pass.

## Stack

- Monorepo (pnpm workspaces): `apps/web`, `apps/api`, `packages/shared`
- Frontend: React + Vite + TypeScript
- Backend: Node.js + Fastify + TypeScript
- Database: PostgreSQL (local via Docker Compose), Drizzle ORM

## Conventions

- TypeScript strict mode everywhere
- Validate every request with a schema; never trust client input
- Follow the Security Checklist in the roadmap from the first line of auth code, not at the end
- Secrets only in `.env` (gitignored); keep `.env.example` up to date
