# Perspective Knowledge Base: Index

A permanent, self-contained explanation of **Perspective**: what it does, how every part works, why it was built that way, what went wrong along the way, and how to learn it. Written in November 2026 against commit `cdd117f` (live at https://perspective-lilac.vercel.app, source at https://github.com/eshmeetbhachu/perspective).

**Labels used everywhere:** **FACT** = verified in the code, git or the live site · **HISTORY** = recovered from the Decision Log, commits or session records · **RECOMMENDATION** = an improvement idea, not implemented · _(reconstructed)_ = reasoning inferred where no record exists.

The repository's own `docs/ROADMAP.md` (Decision Log D1–D75), `docs/DEPLOYMENT.md`, `docs/SCALING.md` and `README.md` remain the primary sources; this knowledge base expands on them.

## Recommended reading order

1. [00 PROJECT_OVERVIEW](00_STARTING_POINT/PROJECT_OVERVIEW.md) → [CURRENT_PROJECT_STATUS](00_STARTING_POINT/CURRENT_PROJECT_STATUS.md) → [COMPLETE_FEATURE_INVENTORY](00_STARTING_POINT/COMPLETE_FEATURE_INVENTORY.md)
2. [SYSTEM_ARCHITECTURE](01_ARCHITECTURE/SYSTEM_ARCHITECTURE.md) → [REQUEST_RESPONSE_FLOWS](01_ARCHITECTURE/REQUEST_RESPONSE_FLOWS.md)
3. Fundamentals as needed: [TYPESCRIPT_FUNDAMENTALS](06_TYPESCRIPT_AND_BACKEND/TYPESCRIPT_FUNDAMENTALS.md), [DATABASE_FUNDAMENTALS](05_DATABASE/DATABASE_FUNDAMENTALS.md)
4. Then follow the 13 modules in [COMPLETE_LEARNING_ROADMAP](10_LEARNING_ROADMAP/COMPLETE_LEARNING_ROADMAP.md) and [MODULE_BY_MODULE_STUDY_GUIDE](10_LEARNING_ROADMAP/MODULE_BY_MODULE_STUDY_GUIDE.md), which point to the right pages below for each step.
5. Finish with [INTERVIEW_QUESTIONS](10_LEARNING_ROADMAP/INTERVIEW_QUESTIONS.md) and [PROJECT_DEFENCE_GUIDE](10_LEARNING_ROADMAP/PROJECT_DEFENCE_GUIDE.md).

## Folder tree

```
PERSPECTIVE_KNOWLEDGE/
├── INDEX.md
├── 00_STARTING_POINT/
│   ├── PROJECT_OVERVIEW.md            what it is, who built it, the one-picture view
│   ├── COMPLETE_FEATURE_INVENTORY.md  every feature: implemented / deployed / lab-only / off / planned / removed
│   ├── TECHNOLOGY_STACK.md            every dependency and service, with versions
│   ├── DEVELOPMENT_TIMELINE.md        51 commits, phase by phase
│   └── CURRENT_PROJECT_STATUS.md      what's live, what's open
├── 01_ARCHITECTURE/
│   ├── SYSTEM_ARCHITECTURE.md         parts, one-origin rule, request lifecycle, environments
│   ├── FRONTEND_ARCHITECTURE.md       layers, state, query keys, routing, forms, rendering
│   ├── BACKEND_ARCHITECTURE.md        layout, startup, hooks, route anatomy, errors, DB access
│   ├── DATABASE_ARCHITECTURE.md       ER diagram, tables, principles, roles
│   ├── REQUEST_RESPONSE_FLOWS.md      7 traced flows: click → SQL → screen
│   ├── AUTHENTICATION_ARCHITECTURE.md sessions, sign-in methods, tokens, guards
│   └── INFRASTRUCTURE_AND_DEPLOYMENT.md production topology, images, env, free-tier limits
├── 02_CODEBASE/
│   ├── COMPLETE_FOLDER_STRUCTURE.md   every tracked file, annotated
│   ├── FRONTEND_FILE_GUIDE.md         every page, component and hook file
│   ├── BACKEND_FILE_GUIDE.md          every API file, script and test file
│   ├── DATABASE_FILE_GUIDE.md         schema, migrations, roles, scripts
│   └── IMPORTANT_FUNCTIONS_AND_MODULES.md  key functions with inputs/outputs/effects
├── 03_TECHNICAL_DECISIONS/
│   ├── ARCHITECTURAL_DECISIONS.md     A1–A10 in decision format
│   ├── TECHNOLOGY_SELECTION.md        each technology vs alternatives
│   ├── DATABASE_DESIGN_DECISIONS.md   DB1–DB14
│   ├── AUTHENTICATION_DECISIONS.md    AU1–AU9
│   ├── SECURITY_DECISIONS.md          S1–S9
│   └── ALTERNATIVES_AND_TRADEOFFS.md  all of D1–D75 with verdicts
├── 04_FEATURE_DEEP_DIVES/
│   ├── AUTH_EMAIL_AND_PASSWORD.md
│   ├── AUTH_GOOGLE_OAUTH.md
│   ├── EMAIL_VERIFICATION_AND_PASSWORD_RESET.md
│   ├── ROLES_AND_GUARDS.md
│   ├── QUESTIONS.md
│   ├── SEARCH_AND_SUGGESTIONS.md
│   ├── STANCES.md
│   ├── POSTS.md
│   ├── VOTES_AND_RANKING.md
│   ├── CHALLENGES_AND_THREADS.md
│   ├── NOTIFICATIONS.md
│   ├── MODERATION.md
│   ├── WEBSITE_STRUCTURE.md
│   └── API_WAKE_UP.md
├── 05_DATABASE/
│   ├── DATABASE_FUNDAMENTALS.md       Postgres from zero, through this project
│   ├── SCHEMA_EXPLANATION.md          every table and column
│   ├── RELATIONSHIPS_AND_CONSTRAINTS.md  every FK, unique rule and check
│   ├── MIGRATIONS_EXPLAINED.md        workflow + all 13 migrations
│   ├── SQL_CONCEPTS_USED.md           RETURNING, ON CONFLICT, FOR UPDATE, CTEs…
│   ├── INDEXING_AND_QUERY_OPTIMIZATION.md  every index; EXPLAIN; Phase 9 findings
│   └── DATABASE_DESIGN_TRADEOFFS.md
├── 06_TYPESCRIPT_AND_BACKEND/
│   ├── TYPESCRIPT_FUNDAMENTALS.md
│   ├── TYPESCRIPT_IN_PERSPECTIVE.md   compiler settings + patterns
│   ├── FASTIFY_EXPLAINED.md
│   ├── API_DESIGN.md                  all 46 endpoints, error codes
│   ├── VALIDATION_AND_ERROR_HANDLING.md
│   ├── ASYNC_PROGRAMMING.md
│   └── BACKEND_DESIGN_PATTERNS.md
├── 07_SECURITY/
│   ├── SECURITY_OVERVIEW.md           threat model + checklist status
│   ├── AUTHENTICATION_AND_AUTHORIZATION.md
│   ├── COOKIE_SECURITY.md
│   ├── OAUTH_FLOW.md
│   ├── PASSWORD_SECURITY.md
│   ├── CSRF_CORS_AND_XSS.md
│   ├── ENVIRONMENT_SECRETS.md
│   └── SECURITY_TRADEOFFS.md          gaps + recommendations
├── 08_BUGS_AND_DEBUGGING/
│   ├── DEVELOPMENT_ISSUES.md          the big problems (hosting saga, …)
│   ├── BUGS_AND_FIXES.md              every recoverable bug: cause, fix, lesson
│   ├── DEBUGGING_LESSONS.md           lessons + a practical toolkit
│   └── KNOWN_LIMITATIONS.md           31 items incl. doc inconsistencies
├── 09_TESTING_AND_DEPLOYMENT/
│   ├── TESTING_ARCHITECTURE.md
│   ├── UNIT_AND_INTEGRATION_TESTS.md
│   ├── E2E_TESTING.md
│   ├── CI_CD_EXPLAINED.md
│   ├── DEPLOYMENT_GUIDE.md
│   ├── LOCAL_DEVELOPMENT_SETUP.md
│   └── SCALING_AND_INFRASTRUCTURE_EXPERIMENTS.md   the lab (not production)
└── 10_LEARNING_ROADMAP/
    ├── COMPLETE_LEARNING_ROADMAP.md   the 13 modules + milestones
    ├── MODULE_BY_MODULE_STUDY_GUIDE.md
    ├── PRACTICAL_CODING_EXERCISES.md  22 exercises (⭐ = real improvements)
    ├── INTERVIEW_QUESTIONS.md         24 questions with model answers
    └── PROJECT_DEFENCE_GUIDE.md
```

## Find it fast

| Question                                   | Go to                                                                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is feature X real, and is it live?         | [COMPLETE_FEATURE_INVENTORY](00_STARTING_POINT/COMPLETE_FEATURE_INVENTORY.md)                                                                      |
| What does endpoint X require and return?   | [API_DESIGN](06_TYPESCRIPT_AND_BACKEND/API_DESIGN.md)                                                                                              |
| What is column X / why does index Y exist? | [SCHEMA_EXPLANATION](05_DATABASE/SCHEMA_EXPLANATION.md), [INDEXING](05_DATABASE/INDEXING_AND_QUERY_OPTIMIZATION.md)                                |
| Why was decision D-n made?                 | [ALTERNATIVES_AND_TRADEOFFS](03_TECHNICAL_DECISIONS/ALTERNATIVES_AND_TRADEOFFS.md) + `docs/ROADMAP.md`                                             |
| Something is broken                        | [DEBUGGING_LESSONS](08_BUGS_AND_DEBUGGING/DEBUGGING_LESSONS.md)                                                                                    |
| What's missing or wrong                    | [KNOWN_LIMITATIONS](08_BUGS_AND_DEBUGGING/KNOWN_LIMITATIONS.md)                                                                                    |
| How to deploy or run locally               | [DEPLOYMENT_GUIDE](09_TESTING_AND_DEPLOYMENT/DEPLOYMENT_GUIDE.md), [LOCAL_DEVELOPMENT_SETUP](09_TESTING_AND_DEPLOYMENT/LOCAL_DEVELOPMENT_SETUP.md) |
| What did Phase 9 prove                     | [SCALING_AND_INFRASTRUCTURE_EXPERIMENTS](09_TESTING_AND_DEPLOYMENT/SCALING_AND_INFRASTRUCTURE_EXPERIMENTS.md)                                      |

## Keeping this up to date

When the code changes, update the matching deep dive, [COMPLETE_FEATURE_INVENTORY](00_STARTING_POINT/COMPLETE_FEATURE_INVENTORY.md) and [CURRENT_PROJECT_STATUS](00_STARTING_POINT/CURRENT_PROJECT_STATUS.md), and change the commit hash noted at the top of this page.
