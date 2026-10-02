import type { PostSort } from "@perspective/shared";
import { desc, lt, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { posts } from "../../db/schema";
import { AppError } from "../../errors";

const cursorSchema = z.object({
  id: z.uuid(),
  rank: z.number().optional(),
  asOf: z.iso.datetime().optional(),
});
type Cursor = z.infer<typeof cursorSchema>;

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value: string): Cursor {
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(value, "base64url").toString()),
    );
    if (parsed.success) return parsed.data;
  } catch {
    // Falls through to the error below.
  }
  throw new AppError(400, "BAD_REQUEST", "Invalid cursor");
}

// Roadmap formula: helpfulness divided by (hours since posted + 2)^1.5, so
// older posts slowly sink. Computed "as of" a fixed moment, so every page of
// one listing ranks posts the same way even while the clock moves on.
function hotScore(asOf: string) {
  return sql<number>`${posts.helpfulScore} / power(greatest(extract(epoch from (${asOf}::timestamptz - ${posts.createdAt})) / 3600, 0) + 2, 1.5)`.mapWith(
    Number,
  );
}

interface Ranking {
  rank: SQL<number>;
  orderBy: SQL[];
  after: SQL | undefined;
  nextCursor: (last: { id: string; rank: number }) => string;
}

// Keyset pagination for each sort: the cursor holds the last post's sort value
// and id, and the next page continues strictly after that pair (D14).
export function rankPosts(sort: PostSort, cursorValue?: string): Ranking {
  const cursor = cursorValue ? decodeCursor(cursorValue) : undefined;
  const invalid = () => new AppError(400, "BAD_REQUEST", "Invalid cursor");

  if (sort === "new") {
    return {
      rank: sql<number>`0`.mapWith(Number),
      orderBy: [desc(posts.id)],
      after: cursor ? lt(posts.id, cursor.id) : undefined,
      nextCursor: ({ id }) => encodeCursor({ id }),
    };
  }

  if (sort === "top") {
    if (cursor && cursor.rank === undefined) throw invalid();
    return {
      rank: sql<number>`${posts.helpfulScore}`.mapWith(Number),
      orderBy: [desc(posts.helpfulScore), desc(posts.id)],
      after: cursor
        ? sql`(${posts.helpfulScore}, ${posts.id}) < (${cursor.rank}::int, ${cursor.id}::uuid)`
        : undefined,
      nextCursor: ({ id, rank }) => encodeCursor({ id, rank }),
    };
  }

  if (cursor && (cursor.rank === undefined || !cursor.asOf)) throw invalid();
  const asOf = cursor?.asOf ?? new Date().toISOString();
  const hot = hotScore(asOf);
  return {
    rank: hot,
    orderBy: [desc(hot), desc(posts.id)],
    after: cursor
      ? sql`(${hot}, ${posts.id}) < (${cursor.rank}::float8, ${cursor.id}::uuid)`
      : undefined,
    nextCursor: ({ id, rank }) => encodeCursor({ id, rank, asOf }),
  };
}
