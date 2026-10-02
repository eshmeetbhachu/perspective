import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { questions } from "../../db/schema";
import { AppError } from "../../errors";

export async function findPublishedQuestionId(slug: string): Promise<string> {
  const [question] = await db
    .select({ id: questions.id })
    .from(questions)
    .where(and(eq(questions.slug, slug), eq(questions.status, "published")));
  if (!question) throw new AppError(404, "NOT_FOUND", "Question not found");
  return question.id;
}
