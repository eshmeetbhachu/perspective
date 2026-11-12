import { z } from "zod";

export const questionTitleSchema = z
  .string()
  .trim()
  .transform((title) => title.replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(10, "Use at least 10 characters")
      .max(150, "Use at most 150 characters")
      .endsWith("?", "Phrase it as a question ending with ?"),
  );

export const createQuestionSchema = z.object({
  title: questionTitleSchema,
  description: z
    .string()
    .trim()
    .max(2000, "Use at most 2000 characters")
    .default(""),
});
export type CreateQuestionInput = z.input<typeof createQuestionSchema>;

export const questionSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  createdAt: z.string(),
  author: z.object({ username: z.string() }).nullable(),
  // How many people stand on each side, and how many live posts there are.
  stanceCounts: z.object({
    for: z.number().int(),
    neutral: z.number().int(),
    against: z.number().int(),
  }),
  postCount: z.number().int(),
});
export type Question = z.infer<typeof questionSchema>;

export const questionResponseSchema = z.object({ question: questionSchema });
export type QuestionResponse = z.infer<typeof questionResponseSchema>;

export const questionListResponseSchema = z.object({
  questions: z.array(questionSchema),
  nextCursor: z.string().nullable(),
});
export type QuestionListResponse = z.infer<typeof questionListResponseSchema>;

// Newest first; most people with a stance; or the biggest smaller side
// between For and Against (many people on both).
export const QUESTION_SORTS = ["new", "active", "divided"] as const;
export type QuestionSort = (typeof QUESTION_SORTS)[number];

export const questionListQuerySchema = z.object({
  sort: z.enum(QUESTION_SORTS).default("new"),
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const questionSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
});

export const similarQuestionsQuerySchema = z.object({
  title: z.string().trim().min(5).max(150),
});
