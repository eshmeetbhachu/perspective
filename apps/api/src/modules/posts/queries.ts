import type { Post } from "@perspective/shared";
import { and, eq, isNull, type SQL, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  challenges,
  posts,
  postVotes,
  questions,
  users,
} from "../../db/schema";
import { AppError } from "../../errors";

export const postColumns = {
  id: posts.id,
  questionId: posts.questionId,
  questionSlug: questions.slug,
  stance: posts.stance,
  title: posts.title,
  body: posts.body,
  authorId: posts.authorId,
  createdAt: posts.createdAt,
  editedAt: posts.editedAt,
  helpfulScore: posts.helpfulScore,
  helpfulCount: posts.helpfulCount,
  crossSideCount: posts.crossSideCount,
  authorUsername: users.username,
  votedByMe: sql<boolean>`${postVotes.userId} is not null`,
  challengeCount: sql<number>`(
    select count(*) from ${challenges}
    where ${challenges.postId} = ${posts.id} and ${challenges.status} = 'open'
  )::int`,
};

type Row = {
  authorId: string | null;
  authorUsername: string | null;
  createdAt: Date;
  editedAt: Date | null;
} & Omit<Post, "author" | "createdAt" | "editedAt">;

export function toPost(row: Row): Post {
  return {
    id: row.id,
    questionId: row.questionId,
    questionSlug: row.questionSlug,
    stance: row.stance,
    title: row.title,
    body: row.body,
    author: row.authorUsername ? { username: row.authorUsername } : null,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    helpfulScore: row.helpfulScore,
    helpfulCount: row.helpfulCount,
    crossSideCount: row.crossSideCount,
    votedByMe: row.votedByMe,
    challengeCount: row.challengeCount,
  };
}

// The viewer's own vote is joined in so each post can say "you found this
// helpful" without a second query. `rank` is the active sort's value, used to
// build the next page's cursor.
export function selectPosts(
  viewerId: string | null,
  rank: SQL<number> = sql<number>`0`.mapWith(Number),
) {
  return db
    .select({ ...postColumns, rank })
    .from(posts)
    .innerJoin(questions, eq(questions.id, posts.questionId))
    .leftJoin(users, eq(users.id, posts.authorId))
    .leftJoin(
      postVotes,
      and(
        eq(postVotes.postId, posts.id),
        viewerId ? eq(postVotes.userId, viewerId) : sql`false`,
      ),
    );
}

// Not deleted by its author, not removed by a moderator, and on a question
// that is still published.
export const live = and(
  isNull(posts.deletedAt),
  isNull(posts.removedAt),
  eq(questions.status, "published"),
);

export async function findPost(postId: string, viewerId: string | null) {
  const [row] = await selectPosts(viewerId).where(
    and(live, eq(posts.id, postId)),
  );
  if (!row) throw new AppError(404, "NOT_FOUND", "Post not found");
  return row;
}
