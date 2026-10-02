import { z } from "zod";
import { postSchema, stanceSchema } from "./posts";

// A thread page shows this many levels; deeper replies open on their own
// page via "Continue this thread".
export const THREAD_PAGE_DEPTH = 5;
// Replies can't nest deeper than this at all.
export const MAX_COMMENT_DEPTH = 50;

export const createChallengeSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "Use at least 5 characters")
    .max(120, "Use at most 120 characters"),
  body: z
    .string()
    .trim()
    .min(30, "Explain your challenge in at least 30 characters")
    .max(5000, "Use at most 5,000 characters"),
});
export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;

const authorSchema = z.object({ username: z.string() }).nullable();

export const challengeSchema = z.object({
  id: z.uuid(),
  postId: z.uuid(),
  title: z.string(),
  body: z.string(),
  author: authorSchema,
  // The challenger's stance on the question, if they declared one.
  authorStance: stanceSchema.nullable(),
  commentCount: z.number().int(),
  createdAt: z.string(),
});
export type Challenge = z.infer<typeof challengeSchema>;

export const challengeResponseSchema = z.object({
  challenge: challengeSchema,
  // The challenged post, or null if its author deleted it.
  post: postSchema.nullable(),
  question: z.object({ slug: z.string(), title: z.string() }),
});
export type ChallengeResponse = z.infer<typeof challengeResponseSchema>;

export const challengeListResponseSchema = z.object({
  challenges: z.array(challengeSchema),
});
export type ChallengeListResponse = z.infer<typeof challengeListResponseSchema>;

export const createCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write something first")
    .max(5000, "Use at most 5,000 characters"),
  parentId: z.uuid().optional(),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const commentSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  // Empty for deleted comments, which stay as placeholders so replies under
  // them keep their place.
  body: z.string(),
  author: authorSchema,
  depth: z.number().int(),
  createdAt: z.string(),
  deleted: z.boolean(),
  // Hidden by a moderator; shown as a placeholder like deleted comments.
  removed: z.boolean(),
  // True at the page's depth limit when there are replies below.
  hasMoreReplies: z.boolean(),
});
export type Comment = z.infer<typeof commentSchema>;

export const commentResponseSchema = z.object({ comment: commentSchema });
export type CommentResponse = z.infer<typeof commentResponseSchema>;

// Depth-first order: every comment comes right after its parent.
export const threadResponseSchema = z.object({
  comments: z.array(commentSchema),
});
export type ThreadResponse = z.infer<typeof threadResponseSchema>;

export const threadQuerySchema = z.object({ root: z.uuid().optional() });

export const notificationSchema = z.object({
  id: z.uuid(),
  type: z.enum(["post_challenged", "comment_reply"]),
  actor: authorSchema,
  challengeId: z.uuid(),
  challengeTitle: z.string(),
  commentId: z.uuid().nullable(),
  read: z.boolean(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationListResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  unreadCount: z.number().int(),
});
export type NotificationListResponse = z.infer<
  typeof notificationListResponseSchema
>;

export const unreadCountResponseSchema = z.object({
  unreadCount: z.number().int(),
});
export type UnreadCountResponse = z.infer<typeof unreadCountResponseSchema>;
