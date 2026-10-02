import {
  createQuestionSchema,
  type Question,
  questionListQuerySchema,
  questionListResponseSchema,
  questionResponseSchema,
  questionSearchQuerySchema,
  similarQuestionsQuerySchema,
} from "@perspective/shared";
import { and, count, desc, eq, gt, lt, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { uniqueViolation } from "../../db/errors";
import { questions, users } from "../../db/schema";
import { AppError } from "../../errors";
import { requireUser, requireVerifiedEmail } from "../../plugins/auth";
import { slugify } from "./slugs";

const DAILY_LIMIT = 5;
const SEARCH_LIMIT = 30;

const columns = {
  id: questions.id,
  slug: questions.slug,
  title: questions.title,
  description: questions.description,
  createdAt: questions.createdAt,
  authorUsername: users.username,
};

type Row = { createdAt: Date; authorUsername: string | null } & Omit<
  Question,
  "createdAt" | "author"
>;

function toQuestion({ authorUsername, createdAt, ...row }: Row): Question {
  return {
    ...row,
    createdAt: createdAt.toISOString(),
    author: authorUsername ? { username: authorUsername } : null,
  };
}

function selectQuestions() {
  return db
    .select(columns)
    .from(questions)
    .leftJoin(users, eq(users.id, questions.createdBy));
}

const published = eq(questions.status, "published");

// Two titles can share a slug; later ones get -2, -3, ... The unique index
// decides, so two simultaneous inserts can't both take the same slug.
async function insertWithUniqueSlug(
  values: Omit<typeof questions.$inferInsert, "slug">,
) {
  const base = slugify(values.title);
  for (let attempt = 1; attempt <= 10; attempt++) {
    const slug = attempt === 1 ? base : `${base}-${String(attempt)}`;
    try {
      const [row] = await db
        .insert(questions)
        .values({ ...values, slug })
        .returning({ id: questions.id });
      if (row) return row.id;
    } catch (err) {
      if (uniqueViolation(err) !== "questions_slug_unique") throw err;
    }
  }
  throw new AppError(
    409,
    "BAD_REQUEST",
    "Too many questions share this title. Try rewording it.",
  );
}

export const questionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/questions",
    {
      preHandler: requireVerifiedEmail,
      schema: {
        body: createQuestionSchema,
        response: { 201: questionResponseSchema },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);

      // Counted in the database, so the limit holds across restarts and
      // across multiple API instances.
      const [recent] = await db
        .select({ total: count() })
        .from(questions)
        .where(
          and(
            eq(questions.createdBy, user.id),
            gt(questions.createdAt, sql`now() - interval '1 day'`),
          ),
        );
      if ((recent?.total ?? 0) >= DAILY_LIMIT) {
        throw new AppError(
          429,
          "RATE_LIMITED",
          `You can ask up to ${String(DAILY_LIMIT)} questions a day`,
        );
      }

      const id = await insertWithUniqueSlug({
        ...request.body,
        createdBy: user.id,
      });
      const [row] = await selectQuestions().where(eq(questions.id, id));
      if (!row) throw new Error("Created question not found");
      return reply.status(201).send({ question: toQuestion(row) });
    },
  );

  // Newest first. The cursor is the last id seen: UUIDv7 ids sort by
  // creation time, so "older than this id" is one index range scan.
  app.get(
    "/questions",
    {
      schema: {
        querystring: questionListQuerySchema,
        response: { 200: questionListResponseSchema },
      },
    },
    async (request) => {
      const { cursor, limit } = request.query;
      const rows = await selectQuestions()
        .where(cursor ? and(published, lt(questions.id, cursor)) : published)
        .orderBy(desc(questions.id))
        .limit(limit + 1);

      const page = rows.slice(0, limit);
      return {
        questions: page.map(toQuestion),
        nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
  );

  // Best matches only: relevance-ranked results past the first few dozen
  // are rarely useful, and ranks don't make stable cursors.
  app.get(
    "/questions/search",
    {
      schema: {
        querystring: questionSearchQuerySchema,
        response: { 200: questionListResponseSchema },
      },
    },
    async (request) => {
      const query = sql`websearch_to_tsquery('english', ${request.query.q})`;
      const rows = await selectQuestions()
        .where(and(published, sql`${questions.searchVector} @@ ${query}`))
        .orderBy(
          desc(sql`ts_rank(${questions.searchVector}, ${query})`),
          desc(questions.id),
        )
        .limit(SEARCH_LIMIT);
      return { questions: rows.map(toQuestion), nextCursor: null };
    },
  );

  // "Did you mean...?" while typing: trigram similarity tolerates typos and
  // word order, which full-text search doesn't.
  app.get(
    "/questions/similar",
    {
      schema: {
        querystring: similarQuestionsQuerySchema,
        response: { 200: questionListResponseSchema },
      },
    },
    async (request) => {
      const { title } = request.query;
      const rows = await selectQuestions()
        .where(and(published, sql`${questions.title} % ${title}`))
        .orderBy(desc(sql`similarity(${questions.title}, ${title})`))
        .limit(5);
      return { questions: rows.map(toQuestion), nextCursor: null };
    },
  );

  app.get(
    "/questions/:slug",
    {
      schema: {
        params: z.object({ slug: z.string().min(1).max(200) }),
        response: { 200: questionResponseSchema },
      },
    },
    async (request) => {
      const [row] = await selectQuestions().where(
        and(published, eq(questions.slug, request.params.slug)),
      );
      if (!row) throw new AppError(404, "NOT_FOUND", "Question not found");
      return { question: toQuestion(row) };
    },
  );
};
