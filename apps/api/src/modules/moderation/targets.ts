import type { ReportTarget } from "@perspective/shared";
import { eq } from "drizzle-orm";
import { db, type Executor } from "../../db/client";
import { challenges, comments, posts, questions, users } from "../../db/schema";

export interface Target {
  authorId: string | null;
  authorUsername: string | null;
  authorBanned: boolean;
  title: string;
  excerpt: string;
  link: string;
  removed: boolean;
  // Visible to readers right now (not deleted, removed, or orphaned).
  visible: boolean;
}

const excerpt = (text: string) =>
  text.length > 280 ? `${text.slice(0, 277)}…` : text;

const author = {
  authorUsername: users.username,
  authorBanned: users.bannedAt,
};

// Looks up any reportable item in the same shape, for the review queue and
// for checking reports and moderator actions.
export async function findTarget(
  type: ReportTarget,
  id: string,
): Promise<Target | null> {
  switch (type) {
    case "question": {
      const [row] = await db
        .select({
          title: questions.title,
          body: questions.description,
          slug: questions.slug,
          status: questions.status,
          authorId: questions.createdBy,
          ...author,
        })
        .from(questions)
        .leftJoin(users, eq(users.id, questions.createdBy))
        .where(eq(questions.id, id));
      if (!row) return null;
      return {
        authorId: row.authorId,
        authorUsername: row.authorUsername,
        authorBanned: row.authorBanned !== null,
        title: row.title,
        excerpt: excerpt(row.body),
        link: `/q/${row.slug}`,
        removed: row.status === "removed",
        visible: row.status === "published",
      };
    }
    case "post": {
      const [row] = await db
        .select({
          title: posts.title,
          body: posts.body,
          authorId: posts.authorId,
          deletedAt: posts.deletedAt,
          removedAt: posts.removedAt,
          questionStatus: questions.status,
          ...author,
        })
        .from(posts)
        .innerJoin(questions, eq(questions.id, posts.questionId))
        .leftJoin(users, eq(users.id, posts.authorId))
        .where(eq(posts.id, id));
      if (!row) return null;
      return {
        authorId: row.authorId,
        authorUsername: row.authorUsername,
        authorBanned: row.authorBanned !== null,
        title: row.title,
        excerpt: excerpt(row.body),
        link: `/posts/${id}`,
        removed: row.removedAt !== null,
        visible:
          !row.deletedAt &&
          !row.removedAt &&
          row.questionStatus === "published",
      };
    }
    case "challenge": {
      const [row] = await db
        .select({
          title: challenges.title,
          body: challenges.body,
          status: challenges.status,
          authorId: challenges.createdBy,
          ...author,
        })
        .from(challenges)
        .leftJoin(users, eq(users.id, challenges.createdBy))
        .where(eq(challenges.id, id));
      if (!row) return null;
      return {
        authorId: row.authorId,
        authorUsername: row.authorUsername,
        authorBanned: row.authorBanned !== null,
        title: row.title,
        excerpt: excerpt(row.body),
        link: `/c/${id}`,
        removed: row.status === "removed",
        visible: row.status === "open",
      };
    }
    case "comment": {
      const [row] = await db
        .select({
          body: comments.body,
          challengeId: comments.challengeId,
          challengeTitle: challenges.title,
          challengeStatus: challenges.status,
          authorId: comments.authorId,
          deletedAt: comments.deletedAt,
          removedAt: comments.removedAt,
          ...author,
        })
        .from(comments)
        .innerJoin(challenges, eq(challenges.id, comments.challengeId))
        .leftJoin(users, eq(users.id, comments.authorId))
        .where(eq(comments.id, id));
      if (!row) return null;
      return {
        authorId: row.authorId,
        authorUsername: row.authorUsername,
        authorBanned: row.authorBanned !== null,
        title: `Comment in “${row.challengeTitle}”`,
        excerpt: excerpt(row.body),
        link: `/c/${row.challengeId}#comment-${id}`,
        removed: row.removedAt !== null,
        visible:
          !row.deletedAt && !row.removedAt && row.challengeStatus === "open",
      };
    }
  }
}

// Hides (or brings back) an item for readers without deleting anything.
export async function setRemoved(
  tx: Executor,
  type: ReportTarget,
  id: string,
  removed: boolean,
): Promise<void> {
  switch (type) {
    case "question":
      await tx
        .update(questions)
        .set({ status: removed ? "removed" : "published" })
        .where(eq(questions.id, id));
      return;
    case "post":
      await tx
        .update(posts)
        .set({ removedAt: removed ? new Date() : null })
        .where(eq(posts.id, id));
      return;
    case "challenge":
      await tx
        .update(challenges)
        .set({ status: removed ? "removed" : "open" })
        .where(eq(challenges.id, id));
      return;
    case "comment":
      await tx
        .update(comments)
        .set({ removedAt: removed ? new Date() : null })
        .where(eq(comments.id, id));
      return;
  }
}
