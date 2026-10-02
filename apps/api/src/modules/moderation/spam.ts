import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { Executor } from "../../db/client";
import { challenges, comments, posts, reports } from "../../db/schema";
import { AppError } from "../../errors";

const NEW_ACCOUNT_DAYS = 3;
const LINKS_FROM_NEW_ACCOUNT = 3;
const BURST_COMMENTS = 10;
const BURST_MINUTES = 10;

type ContentType = "post" | "challenge" | "comment";

const tables = {
  post: {
    table: posts,
    id: posts.id,
    author: posts.authorId,
    body: posts.body,
    at: posts.createdAt,
    // Text the author deleted isn't live, so posting it again is fine.
    live: isNull(posts.deletedAt),
  },
  challenge: {
    table: challenges,
    id: challenges.id,
    author: challenges.createdBy,
    body: challenges.body,
    at: challenges.createdAt,
    live: undefined,
  },
  comment: {
    table: comments,
    id: comments.id,
    author: comments.authorId,
    body: comments.body,
    at: comments.createdAt,
    live: isNull(comments.deletedAt),
  },
};

const normalize = (text: string) =>
  text.trim().toLowerCase().replace(/\s+/g, " ");

// Copy-pasting the same text again within a day is the most common spam
// pattern, so it's refused outright. Runs right after the insert, in the same
// transaction, so more specific errors (like "already posted on this side")
// win and a refusal rolls the new row back.
export async function rejectDuplicate(
  tx: Executor,
  type: ContentType,
  item: { id: string; authorId: string; body: string },
): Promise<void> {
  const { table, id, author, body, at, live } = tables[type];
  const [match] = await tx
    .select({ one: sql`1` })
    .from(table)
    .where(
      and(
        eq(author, item.authorId),
        ne(id, item.id),
        gt(at, sql`now() - interval '1 day'`),
        live,
        sql`lower(regexp_replace(trim(${body}), '\\s+', ' ', 'g')) = ${normalize(item.body)}`,
      ),
    )
    .limit(1);
  if (match) {
    throw new AppError(
      409,
      "DUPLICATE_CONTENT",
      "You already posted this text recently",
    );
  }
}

// Softer signals don't block anything: they put the item in the moderation
// queue as an automated report for a person to judge (D51).
export async function flagIfSuspicious(
  tx: Executor,
  item: {
    type: ContentType;
    id: string;
    body: string;
    author: { id: string; createdAt: Date };
  },
): Promise<void> {
  const reasons: string[] = [];

  const accountAgeDays =
    (Date.now() - item.author.createdAt.getTime()) / (24 * 60 * 60 * 1000);
  const links = item.body.match(/https?:\/\//gi)?.length ?? 0;
  if (accountAgeDays < NEW_ACCOUNT_DAYS && links >= LINKS_FROM_NEW_ACCOUNT) {
    reasons.push(
      `${String(links)} links from an account under ${String(NEW_ACCOUNT_DAYS)} days old`,
    );
  }

  if (item.type === "comment") {
    const [recent] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(comments)
      .where(
        and(
          eq(comments.authorId, item.author.id),
          gt(
            comments.createdAt,
            sql`now() - make_interval(mins => ${BURST_MINUTES})`,
          ),
        ),
      );
    if ((recent?.total ?? 0) >= BURST_COMMENTS) {
      reasons.push(
        `${String(recent?.total ?? 0)} comments in ${String(BURST_MINUTES)} minutes`,
      );
    }
  }

  if (reasons.length > 0) {
    await tx.insert(reports).values({
      targetType: item.type,
      targetId: item.id,
      reason: "automated",
      details: reasons.join("; "),
    });
  }
}
