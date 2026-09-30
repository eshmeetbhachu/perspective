# Perspective

An opinion platform where people understand viewpoints before debating them. Questions are split into For / Neutral / Against, posts explain reasoning, and debate happens only inside Challenges.

The full plan (decision log, architecture, data model, security checklist, phases) is in @docs/ROADMAP.md. Treat it as the source of truth.

## Working agreement (most important)

I am building this project to learn, especially system design and scalability. I drive every stage.

- Work one phase at a time, in roadmap order. Do not jump ahead or add features that aren't in the roadmap without asking me.
- Before writing code for a step, briefly tell me what you're about to do and why.
- After writing code, explain every file you created or changed: what it does, how the important lines work, and why this approach was chosen over the alternatives.
- When a step involves a real design decision (anything marked 🟡 in the roadmap, or any new trade-off), stop and ask me. Lay out the options and trade-offs, give your recommendation, and let me decide.
- When I make a decision, add it to the Decision Log in docs/ROADMAP.md with the reason.
- Tick off roadmap checkboxes as steps are completed.
- Tell me the commands to run and what I should see. Let me run, test, and commit things myself; do not make git commits for me.
- If I ask "why", answer properly. Never just say "it's best practice".

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
