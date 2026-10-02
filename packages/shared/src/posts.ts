import { z } from "zod";
import { STANCES } from "./stances";

export const stanceSchema = z.enum(STANCES);

export const setStanceSchema = z.object({ stance: stanceSchema });
export type SetStanceInput = z.infer<typeof setStanceSchema>;

export const myStanceResponseSchema = z.object({
  stance: stanceSchema.nullable(),
  // When the stance may next be changed; null if it can change now (D8).
  changeableAt: z.string().nullable(),
});
export type MyStanceResponse = z.infer<typeof myStanceResponseSchema>;

export const postTitleSchema = z
  .string()
  .trim()
  .min(5, "Use at least 5 characters")
  .max(120, "Use at most 120 characters");

// Markdown source; the frontend renders and sanitizes it.
export const postBodySchema = z
  .string()
  .trim()
  .min(30, "Explain your reasoning in at least 30 characters")
  .max(10000, "Use at most 10,000 characters");

export const createPostSchema = z.object({
  title: postTitleSchema,
  body: postBodySchema,
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = createPostSchema;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const voteSchema = z.object({
  helpfulScore: z.number().int(),
  helpfulCount: z.number().int(),
  crossSideCount: z.number().int(),
  // Whether the person asking has marked this post helpful.
  votedByMe: z.boolean(),
});
export type VoteResponse = z.infer<typeof voteSchema>;

// Posts helpful to at least this many people from another side get the
// "valued across sides" badge.
export const CROSS_SIDE_BADGE_MIN = 3;

export const postSchema = z.object({
  id: z.uuid(),
  questionId: z.uuid(),
  stance: stanceSchema,
  title: z.string(),
  body: z.string(),
  author: z.object({ username: z.string() }).nullable(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  challengeCount: z.number().int(),
  ...voteSchema.shape,
});
export type Post = z.infer<typeof postSchema>;

export const postResponseSchema = z.object({ post: postSchema });
export type PostResponse = z.infer<typeof postResponseSchema>;

export const postListResponseSchema = z.object({
  posts: z.array(postSchema),
  nextCursor: z.string().nullable(),
});
export type PostListResponse = z.infer<typeof postListResponseSchema>;

export const POST_SORTS = ["top", "hot", "new"] as const;
export type PostSort = (typeof POST_SORTS)[number];

export const postListQuerySchema = z.object({
  stance: stanceSchema,
  sort: z.enum(POST_SORTS).default("top"),
  // Opaque: the client passes back whatever nextCursor it was given.
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
