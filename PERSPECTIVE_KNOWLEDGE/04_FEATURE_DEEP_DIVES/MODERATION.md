# Feature: Moderation

**User-facing purpose:** members report harmful content; moderators review a queue, remove or restore content with a written reason, dismiss false reports, and ban or unban accounts. Every moderator action is permanently recorded. Automated checks refuse copy-paste spam and flag suspicious patterns.

## Pieces

| Layer  | Files                                                                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI     | `components/ReportButton.tsx` (on questions, posts, challenges, comments), `pages/ModerationPage.tsx` (Reports / Audit log / Users tabs)           |
| Hooks  | `moderation.ts`: `useReport`, `useQueue`, `useAudit`, `useModerate`, `useBan`                                                                      |
| Shared | `moderation.ts`: `REPORT_TARGETS`, `REPORT_REASONS`, labels, `createReportSchema`, `moderationReasonSchema` (3–500 chars), queue and audit schemas |
| API    | `modules/moderation/routes.ts`, `targets.ts`, `spam.ts`                                                                                            |
| Tables | `reports`, `audit_log`, plus `status`/`removed_at` columns on `questions`, `posts`, `challenges`, `comments`; `users.banned_at`; `sessions`        |

## Reporting (`POST /reports`)

- Any logged-in user; body `{ targetType, targetId, reason, details? }`. Reasons a person may choose: spam, harassment, hate, misleading, off_topic, other. `automated` is reserved for the system: the shared schema's `reason` enum excludes it (test `validation.test.ts:128`).
- Refused if the target doesn't exist or isn't visible (404), or is your own (403).
- **20 reports per day** per person (Postgres count).
- **One report per person per item:** unique `(reporter_id, target_type, target_id)` + `ON CONFLICT DO NOTHING`. The answer is always 204, so reporting twice reveals nothing and changes nothing.

## The review queue (`GET /moderation/queue`)

```sql
SELECT target_type, target_id, count(*)::int AS report_count,
       array_agg(DISTINCT reason)::text[] AS reasons,
       array_remove(array_agg(details), '') AS details,
       max(created_at) AS last_reported_at
FROM reports WHERE status = 'open'
GROUP BY target_type, target_id
ORDER BY count(*) DESC, max(created_at) DESC
LIMIT 50
```

- **One row per item**, most-reported first (D50). The partial index `reports_open_idx (target_type, target_id) WHERE status = 'open'` keeps this cheap: closed reports aren't in it.
- `::text[]` matters: Postgres returns an array of a custom enum type as a string like `{spam,hate}` that the driver doesn't parse; casting to `text[]` returns a real array. This was a bug found during Phase 6 ([BUGS_AND_FIXES.md](../08_BUGS_AND_DEBUGGING/BUGS_AND_FIXES.md)).
- Each item gets a **preview** from `findTarget` (title, 280-char excerpt, author, whether the author is banned, a link, whether it's already removed), so moderators can judge without opening pages. `preview` is `null` if the content no longer exists.
- The previews are fetched with `Promise.all` over up to 50 items, which is up to 50 small queries. That's acceptable for a moderator page used by a few people.

## Actions (all inside the moderator scope)

| Route                                    | Body         | Transaction contents                                                   | Cache             |
| ---------------------------------------- | ------------ | ---------------------------------------------------------------------- | ----------------- |
| `POST /moderation/:type/:id/remove`      | `{ reason }` | `setRemoved(true)` + close open reports as `resolved` + audit `remove` | bump `moderation` |
| `POST /moderation/:type/:id/restore`     | `{ reason }` | `setRemoved(false)` + audit `restore`                                  | bump `moderation` |
| `POST /moderation/:type/:id/dismiss`     | none         | close open reports as `dismissed` + audit `dismiss_reports`            | none              |
| `POST /moderation/users/:username/ban`   | `{ reason }` | `banned_at = now()` + **delete all sessions** + audit `ban_user`       | none              |
| `POST /moderation/users/:username/unban` | `{ reason }` | `banned_at = null` + audit `unban_user`                                | none              |
| `GET /moderation/audit`                  | none         | latest 100 entries with the actor's username                           | none              |

What "removed" means per type (`setRemoved`):

| Type      | Removed state        | Effect                                                                                  |
| --------- | -------------------- | --------------------------------------------------------------------------------------- |
| question  | `status = 'removed'` | 404 everywhere; its posts and challenges vanish too (they filter on `questions.status`) |
| post      | `removed_at = now()` | fails `live`; challenges remain readable                                                |
| challenge | `status = 'removed'` | 404, hidden from lists                                                                  |
| comment   | `removed_at = now()` | placeholder "[removed by a moderator]" in the thread                                    |

**Why removal is separate from author deletion (D50):** a mistaken removal can be restored exactly; the author's own deletion isn't confused with moderation in the record; and a removed post still occupies its slot, so the author can't simply post it again.

**Why a reason is mandatory:** the audit log should explain every decision to a future reviewer. The shared schema enforces 3–500 characters.

**Ban rules:** you can't ban yourself or anyone whose rank is equal to or above yours (`ROLE_RANK[target] >= ROLE_RANK[moderator]` → 403). Deleting all sessions logs the person out everywhere immediately; `validateSession` also refuses banned users, and login refuses them with "This account has been suspended". **Gap:** unban has no rank check (see [ROLES_AND_GUARDS.md](ROLES_AND_GUARDS.md#known-gap-fact-recommendation)).

## The append-only audit log (D52)

Migration `0009` ends with:

```sql
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log" FROM perspective_app;
```

The application's database role can `INSERT` and `SELECT` audit rows, but never change or delete them. Even a fully compromised API can't erase moderation history. The test `moderation.test.ts:380` attempts an `UPDATE` and a `DELETE` as the app role and expects permission errors. The audit row is written in the **same transaction** as the action, so an action without an audit entry is impossible.

## Automated checks (D51, `spam.ts`)

| Check                                                                             | Applies to                  | Action                                                   |
| --------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------- |
| Same normalized text by the same author within 24 h (excluding text they deleted) | posts, challenges, comments | **Refused**: 409 `DUPLICATE_CONTENT`; insert rolled back |
| ≥3 `http(s)://` links from an account < 3 days old                                | posts, challenges, comments | **Flagged**: automated report; content stays published   |
| ≥10 comments in 10 minutes                                                        | comments                    | **Flagged**                                              |

- "Normalized" = trimmed, lower-cased, whitespace collapsed, compared in SQL with `lower(regexp_replace(trim(body), '\s+', ' ', 'g'))` and in TypeScript with the same steps.
- **Why refuse duplicates but only flag the rest:** copy-paste is almost always spam, so refusing it is safe. Link counts and bursts have false positives (an enthusiastic new user citing sources), so a human decides.
- **Why after the insert:** the more specific error ("you already posted on this side", from the unique index) should win. Checking first would hide it. This ordering bug was found and fixed in Phase 6.
- Automated reports have `reporter_id = null`. The unique index treats nulls as distinct, so several automated flags on one item are allowed.

## Frontend

- `ReportButton` is hidden when logged out and on your own content; it expands into a reason picker plus optional details; afterwards it shows "Reported. A moderator will review it."
- `ModerationPage` keeps the current tab in the URL (`?tab=audit`). Each queue card has a note field ("needed to remove or ban") and Remove / Dismiss / Ban author buttons. **Restore** is offered from the Audit log tab next to "removed" entries, and asks for a reason with `window.prompt`. The Users tab bans or unbans by username.

## Tests

`moderation.test.ts` (reporting rules and limits, queue access and grouping, remove/restore for each type, dismiss, forbidden to users, bans log out everywhere and respect rank, audit listing and immutability, the three automated checks). E2E `moderation.spec.ts`: report → review → remove → restore; a ban logs the person out immediately; non-moderators can't open the dashboard.
