# Feature: Stances (Taking a Side)

**User-facing purpose:** each reader declares where they stand on a question: For, Neutral or Against. The stance decides which column their posts go into, how much their votes are worth to each post, and what the question's split looks like. You can change your mind, but at most once a day.

## Pieces

| Layer  | Files                                                                                        |
| ------ | -------------------------------------------------------------------------------------------- |
| UI     | `components/StancePicker.tsx` on `QuestionPage`; `StanceBar.tsx` shows the split             |
| Hooks  | `posts.ts`: `useMyStance(slug, enabled)`, `useSetStance(slug)`                               |
| Shared | `stances.ts` (`STANCES`, `Stance`), `posts.ts` (`setStanceSchema`, `myStanceResponseSchema`) |
| API    | `modules/stances/routes.ts`, `counts.ts`                                                     |
| Tables | `user_stances` (current), `stance_history` (log), `questions` (counters)                     |

## Endpoints

| Route                         | Guard     | Limit   | Response                                                |
| ----------------------------- | --------- | ------- | ------------------------------------------------------- |
| `GET /questions/:slug/stance` | logged in | none    | `{ stance: Stance \| null, changeableAt: ISO \| null }` |
| `PUT /questions/:slug/stance` | logged in | 30/hour | same                                                    |

`changeableAt` is when the stance may next change; `null` means it can change now (or there's no stance yet).

## Rules (D5, D8, D43)

1. One stance per person per question: primary key `(user_id, question_id)`.
2. Declaring is free; **any** change is allowed only if the last change (or the first declaration) was ≥24 hours ago. Choosing the side you already hold is a no-op (no cooldown is consumed, test `posts.test.ts:110`).
3. Every declaration and change is written to `stance_history` (`from_stance` null for the first).
4. The question's three counters move in the same transaction.

**Why the cooldown starts at the first declaration (D43):** otherwise someone could declare For, vote on Against posts (worth 3 each), immediately switch to Against, and vote on For posts, collecting cross-side credit twice. Because of this, the UI asks for confirmation before _any_ stance is saved.

## The transaction (`stances/routes.ts:75`)

```ts
const row = await db.transaction(async (tx) => {
  const [current] = await tx.select().from(userStances).where(key).for("update");

  if (!current) {
    const [created] = await tx.insert(userStances).values({...}).onConflictDoNothing().returning();
    if (!created) throw new AppError(409, "BAD_REQUEST", "Please try again");
    await tx.insert(stanceHistory).values({ userId, questionId, toStance: stance });
    await moveStanceCount(tx, questionId, null, stance);
    return created;
  }
  if (current.stance === stance) return current;
  if (changeableAt(current.updatedAt)) throw new AppError(429, "STANCE_COOLDOWN", ...);

  const [updated] = await tx.update(userStances).set({ stance, updatedAt: new Date() }).where(key).returning();
  await tx.insert(stanceHistory).values({ ..., fromStance: current.stance, toStance: stance });
  await moveStanceCount(tx, questionId, current.stance, stance);
  return updated ?? current;
});
await bumpCache(request.log, `question:${request.params.slug}`);
```

### Concurrency, explained

- **Changing an existing stance:** `SELECT ... FOR UPDATE` locks the row. A second concurrent request blocks on the same `SELECT` until the first commits, then reads the _new_ `updated_at` and hits the cooldown. Without the lock both could read the old row and both change it.
- **First declaration:** there's no row to lock yet. Two concurrent first declarations both see "no row"; both try to `INSERT`; the primary key lets one win. `onConflictDoNothing()` turns the loser's failure into "no row returned", and the code answers 409 "Please try again" instead of a 500. Test `posts.test.ts:118` fires two changes at once and checks that exactly one succeeds.
- **Counters:** `moveStanceCount` adds +1/-1 with `for_count = for_count + $delta`. That's an atomic read-modify-write inside the database, so concurrent stances on the same question can't lose updates. The check constraint `questions_stance_counts_positive` makes a negative count (which would mean a bug) fail loudly.

## Snapshots elsewhere

Your stance is _copied_ at the moment it matters:

- `posts.stance`: the column a post is filed under, fixed at posting time (D41).
- `post_votes.voter_stance` + `weight`: frozen at vote time (D7).

So changing sides later doesn't move your old post or change the credit of your old votes.

## UI behaviour (`StancePicker.tsx`)

| State                | Shows                                                                    |
| -------------------- | ------------------------------------------------------------------------ |
| Logged out           | "Where do you stand? Log in to choose a side and write a post."          |
| No stance            | Three buttons                                                            |
| Button clicked       | "Your stance: **against**? You can change it once a day." Confirm/Cancel |
| Has stance, locked   | Buttons disabled; "You can change it after <date>"                       |
| Has stance, unlocked | Other two buttons enabled (confirmation again)                           |

After success the response is written into `["stance", slug]`: the picker updates, `QuestionPage` shows "Write a post" in your column, and `HelpfulButton` enables voting.

**Note:** the stance counts shown in the `StanceSummary` come from the question query, which isn't invalidated after setting a stance, so the summary updates on the next refetch of the question (e.g. on revisiting the page). **(Observation, minor.)**

## Who needs a verified email?

Declaring a stance needs only a login, not a verified email. **(Reconstructed reasoning:)** a stance isn't public content, and every content action that follows (posting, voting) does require verification.

## Data for the future

`stance_history` exists "for changed my mind insights later" (D8). No feature reads it yet; it's an investment in a possible "how many people changed sides after reading" metric.

## Tests

`posts.test.ts` "stances" block; `question-counts.test.ts` "stance counts" block (counts per side, moving between sides, repeats).
