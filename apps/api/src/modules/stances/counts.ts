import type { Stance } from "@perspective/shared";
import { eq, sql } from "drizzle-orm";
import { db, type Executor } from "../../db/client";
import { questions } from "../../db/schema";

// +1 for the side joined, -1 for the side left, 0 for the third.
const delta = (side: Stance, from: Stance | null, to: Stance) =>
  (side === to ? 1 : 0) - (side === from ? 1 : 0);

// One person joins `to` (and leaves `from` when changing sides). Runs inside
// the stance transaction, so the counts can't drift from user_stances.
export async function moveStanceCount(
  tx: Executor,
  questionId: string,
  from: Stance | null,
  to: Stance,
): Promise<void> {
  await tx
    .update(questions)
    .set({
      forCount: sql`${questions.forCount} + ${delta("for", from, to)}`,
      neutralCount: sql`${questions.neutralCount} + ${delta("neutral", from, to)}`,
      againstCount: sql`${questions.againstCount} + ${delta("against", from, to)}`,
    })
    .where(eq(questions.id, questionId));
}

// Rebuilds every question's counts from user_stances, for scripts that write
// stances in bulk (the seed).
export async function recountStances(): Promise<void> {
  await db.execute(sql`
    update ${questions} q set
      for_count = coalesce(s.for_count, 0),
      neutral_count = coalesce(s.neutral_count, 0),
      against_count = coalesce(s.against_count, 0)
    from ${questions} q2
    left join (
      select question_id,
        count(*) filter (where stance = 'for')::int as for_count,
        count(*) filter (where stance = 'neutral')::int as neutral_count,
        count(*) filter (where stance = 'against')::int as against_count
      from user_stances group by question_id
    ) s on s.question_id = q2.id
    where q.id = q2.id`);
}
