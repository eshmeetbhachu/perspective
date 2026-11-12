import {
  createQuestionSchema,
  type Question,
  questionListQuerySchema,
  questionListResponseSchema,
  questionResponseSchema,
  questionSearchQuerySchema,
  similarQuestionsQuerySchema,
} from "@perspective/shared";
import { and, count, desc, eq, gt, lt, type SQL, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  bumpCache,
  questionCache,
  questionListCache,
  readerFor,
} from "../../cache";
import { db, type Executor } from "../../db/client";
import { uniqueViolation } from "../../db/errors";
import { posts, questions, users } from "../../db/schema";
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
  forCount: questions.forCount,
  neutralCount: questions.neutralCount,
  againstCount: questions.againstCount,
  // Counted from the posts_column_idx index, which holds only live posts.
  postCount: sql<number>`(
    select count(*) from ${posts}
    where ${posts.questionId} = ${questions.id}
      and ${posts.deletedAt} is null and ${posts.removedAt} is null
  )::int`,
};

interface Row {
  id: string;
  slug: string;
  title: string;
  description: string;
  createdAt: Date;
  authorUsername: string | null;
  forCount: number;
  neutralCount: number;
  againstCount: number;
  postCount: number;
}

function toQuestion(row: Row): Question {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    author: row.authorUsername ? { username: row.authorUsername } : null,
    stanceCounts: {
      for: row.forCount,
      neutral: row.neutralCount,
      against: row.againstCount,
    },
    postCount: row.postCount,
  };
}

// The ranked sorts, written exactly as their indexes are, so Postgres can use
// them: questions_active_idx and questions_divided_idx.
const ranks: Record<
  "active" | "divided",
  { sql: SQL; of: (row: Row) => number }
> = {
  active: {
    sql: sql`(${questions.forCount} + ${questions.neutralCount} + ${questions.againstCount})`,
    of: (row) => row.forCount + row.neutralCount + row.againstCount,
  },
  divided: {
    sql: sql`least(${questions.forCount}, ${questions.againstCount})`,
    of: (row) => Math.min(row.forCount, row.againstCount),
  },
};

const rankedCursor = z.string().regex(/^\d{1,10}:[0-9a-f-]{36}$/);

function badCursor(): AppError {
  return new AppError(400, "BAD_REQUEST", "That page link is no longer valid");
}

function selectQuestions(reader: Executor = db) {
  return reader
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
      await bumpCache(request.log, "questions");
      return reply.status(201).send({ question: toQuestion(row) });
    },
  );

  // Newest first by default. The cursor is the last id seen: UUIDv7 ids sort
  // by creation time, so "older than this id" is one index range scan. The
  // ranked sorts use "rank:id" the same way, in their own index's order.
  app.get(
    "/questions",
    {
      config: { cache: questionListCache },
      schema: {
        querystring: questionListQuerySchema,
        response: { 200: questionListResponseSchema },
      },
    },
    async (request) => {
      const { sort, cursor, limit } = request.query;
      const rank = sort === "new" ? null : ranks[sort];

      let after: SQL | undefined;
      if (cursor && rank) {
        if (!rankedCursor.safeParse(cursor).success) throw badCursor();
        const [value, id] = cursor.split(":");
        after = sql`(${rank.sql}, ${questions.id}) < (${Number(value)}, ${id})`;
      } else if (cursor) {
        if (!z.uuid().safeParse(cursor).success) throw badCursor();
        after = lt(questions.id, cursor);
      }

      const rows = await selectQuestions(readerFor(request))
        .where(and(published, after))
        .orderBy(
          ...(rank
            ? [desc(rank.sql), desc(questions.id)]
            : [desc(questions.id)]),
        )
        .limit(limit + 1);

      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        questions: page.map(toQuestion),
        nextCursor:
          rows.length > limit && last
            ? rank
              ? `${String(rank.of(last))}:${last.id}`
              : last.id
            : null,
      };
    },
  );

  // Best matches only: relevance-ranked results past the first few dozen
  // are rarely useful, and ranks don't make stable cursors.
  app.get(
    "/questions/search",
    {
      config: { cache: questionListCache },
      schema: {
        querystring: questionSearchQuerySchema,
        response: { 200: questionListResponseSchema },
      },
    },
    async (request) => {
      const query = sql`websearch_to_tsquery('english', ${request.query.q})`;
      const rows = await selectQuestions(readerFor(request))
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
      config: { cache: questionCache },
      schema: {
        params: z.object({ slug: z.string().min(1).max(200) }),
        response: { 200: questionResponseSchema },
      },
    },
    async (request) => {
      const [row] = await selectQuestions(readerFor(request)).where(
        and(published, eq(questions.slug, request.params.slug)),
      );
      if (!row) throw new AppError(404, "NOT_FOUND", "Question not found");
      return { question: toQuestion(row) };
    },
  );
};
