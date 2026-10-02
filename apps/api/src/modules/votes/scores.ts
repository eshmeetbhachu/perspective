import { sql } from "drizzle-orm";
import { db } from "../../db/client";

// Rebuilds every vote weight and post score from the stored voter stances.
// Run after changing the weights in weights.ts (D44). The CASE mirrors
// voteWeight(); a test keeps the two in agreement.
export async function recomputeScores(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      update post_votes v
      set weight = case
        when v.voter_stance = p.stance then 1
        when v.voter_stance = 'neutral' or p.stance = 'neutral' then 2
        else 3
      end
      from posts p
      where p.id = v.post_id
    `);
    await tx.execute(sql`
      update posts p
      set helpful_score = coalesce(t.score, 0),
          helpful_count = coalesce(t.votes, 0),
          cross_side_count = coalesce(t.cross_side, 0)
      from posts p2
      left join (
        select v.post_id,
               sum(v.weight)::int as score,
               count(*)::int as votes,
               count(*) filter (where v.voter_stance <> p3.stance)::int as cross_side
        from post_votes v
        join posts p3 on p3.id = v.post_id
        group by v.post_id
      ) t on t.post_id = p2.id
      where p.id = p2.id
    `);
  });
}
