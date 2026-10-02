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
});
export type Question = z.infer<typeof questionSchema>;

export const questionResponseSchema = z.object({ question: questionSchema });
export type QuestionResponse = z.infer<typeof questionResponseSchema>;

export const questionListResponseSchema = z.object({
  questions: z.array(questionSchema),
  nextCursor: z.uuid().nullable(),
});
export type QuestionListResponse = z.infer<typeof questionListResponseSchema>;

export const questionListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const questionSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
});

export const similarQuestionsQuerySchema = z.object({
  title: z.string().trim().min(5).max(150),
});
