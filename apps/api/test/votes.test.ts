import type {
  PostListResponse,
  PostResponse,
  Stance,
  VoteResponse,
} from "@perspective/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { db } from "../src/db/client";
import {
  posts,
  postVotes,
  questions,
  userStances,
  users,
} from "../src/db/schema";
import { recomputeScores } from "../src/modules/votes/scores";
import { voteWeight } from "../src/modules/votes/weights";
import { errorCode, get, register, resetDatabase } from "./helpers";

const SLUG = "should-voting-be-mandatory";
const ORIGIN = "http://localhost:5173";
const DAY_MS = 24 * 60 * 60 * 1000;
const BODY =
  "A careful argument that is comfortably longer than thirty characters.";

let app: FastifyInstance;
let questionId: string;

beforeEach(async () => {
  await resetDatabase();
  app = await buildApp();
  const [question] = await db
    .insert(questions)
    .values({ title: "Should voting be mandatory?", slug: SLUG })
    .returning({ id: questions.id });
  questionId = question?.id ?? "";
});

afterEach(async () => {
  await app.close();
});

// A verified, two-day-old account that has declared a stance.
async function voter(username: string, stance: Stance | null) {
  const { session, body } = await register(app, {
    username,
    email: `${username}@example.com`,
  });
  await db
    .update(users)
    .set({
      emailVerifiedAt: new Date(),
      createdAt: new Date(Date.now() - 2 * DAY_MS),
    })
    .where(eq(users.id, body.user.id));
  if (stance) {
    await db
      .insert(userStances)
      .values({ userId: body.user.id, questionId, stance });
  }
  return { session, userId: body.user.id };
}

async function createPost(
  stance: Stance,
  title = `A ${stance} post`,
  values: Partial<typeof posts.$inferInsert> = {},
) {
  const [row] = await db
    .insert(posts)
    .values({ questionId, stance, title, body: BODY, ...values })
    .returning({ id: posts.id });
  return row?.id ?? "";
}

function vote(
  postId: string,
  session: string,
  method: "PUT" | "DELETE" = "PUT",
) {
  return app.inject({
    method,
    url: `/posts/${postId}/vote`,
    headers: { origin: ORIGIN },
    cookies: { session },
  });
}

async function scoreOf(postId: string) {
  const [row] = await db
    .select({
      score: posts.helpfulScore,
      count: posts.helpfulCount,
      crossSide: posts.crossSideCount,
    })
    .from(posts)
    .where(eq(posts.id, postId));
  return row;
}

describe("vote weights (D44)", () => {
  it("count 1 for the same side, 2 with Neutral involved, 3 across", () => {
    expect(voteWeight("for", "for")).toBe(1);
    expect(voteWeight("neutral", "neutral")).toBe(1);
    expect(voteWeight("neutral", "against")).toBe(2);
    expect(voteWeight("for", "neutral")).toBe(2);
    expect(voteWeight("for", "against")).toBe(3);
    expect(voteWeight("against", "for")).toBe(3);
  });

  it("are applied to the post's score and cross-side count", async () => {
    const postId = await createPost("for");
    const sameSide = await voter("ally", "for");
    const neutral = await voter("middle", "neutral");
    const opposite = await voter("rival", "against");

    await vote(postId, sameSide.session);
    await vote(postId, neutral.session);
    const last = await vote(postId, opposite.session);

    expect(last.json<VoteResponse>()).toEqual({
      helpfulScore: 1 + 2 + 3,
      helpfulCount: 3,
      crossSideCount: 2,
      votedByMe: true,
    });
  });
});

describe("who can vote", () => {
  it("needs a verified email", async () => {
    const postId = await createPost("for");
    const { session } = await register(app);
    expect(errorCode(await vote(postId, session))).toBe("EMAIL_NOT_VERIFIED");
  });

  it("makes accounts wait 24 hours (D45)", async () => {
    const postId = await createPost("for");
    const { session, userId } = await voter("fresh", "against");
    await db
      .update(users)
      .set({ createdAt: new Date(Date.now() - 23 * 60 * 60 * 1000) })
      .where(eq(users.id, userId));

    const response = await vote(postId, session);
    expect(response.statusCode).toBe(403);
    expect(errorCode(response)).toBe("ACCOUNT_TOO_NEW");
  });

  it("needs a stance on the question (D6)", async () => {
    const postId = await createPost("for");
    const { session } = await voter("undecided", null);
    expect(errorCode(await vote(postId, session))).toBe("STANCE_REQUIRED");
  });

  it("can't vote on their own post", async () => {
    const { session, userId } = await voter("author", "for");
    const postId = await createPost("for", "My post", { authorId: userId });
    expect(errorCode(await vote(postId, session))).toBe("OWN_POST");
  });

  it("can't vote on deleted posts", async () => {
    const postId = await createPost("for", "Gone post", {
      deletedAt: new Date(),
    });
    const { session } = await voter("late", "against");
    expect((await vote(postId, session)).statusCode).toBe(404);
  });
});

describe("voting and unvoting", () => {
  it("counts a repeated vote once", async () => {
    const postId = await createPost("for");
    const { session } = await voter("rival", "against");
    await vote(postId, session);
    await vote(postId, session);
    expect(await scoreOf(postId)).toEqual({ score: 3, count: 1, crossSide: 1 });
  });

  it("stays exact under simultaneous votes", async () => {
    const postId = await createPost("for");
    const voters = await Promise.all(
      ["voter1", "voter2", "voter3", "voter4", "voter5"].map((name) =>
        voter(name, "against"),
      ),
    );
    const rival = voters[0]?.session ?? "";

    await Promise.all([
      ...voters.map((v) => vote(postId, v.session)),
      vote(postId, rival),
      vote(postId, rival),
    ]);
    expect(await scoreOf(postId)).toEqual({
      score: 15,
      count: 5,
      crossSide: 5,
    });
  });

  it("unvoting removes exactly what the vote added", async () => {
    const postId = await createPost("for");
    const { session } = await voter("rival", "against");
    await vote(postId, session);

    const response = await vote(postId, session, "DELETE");
    expect(response.json<VoteResponse>()).toEqual({
      helpfulScore: 0,
      helpfulCount: 0,
      crossSideCount: 0,
      votedByMe: false,
    });
    // Unvoting twice changes nothing.
    await vote(postId, session, "DELETE");
    expect(await scoreOf(postId)).toEqual({ score: 0, count: 0, crossSide: 0 });
  });

  it("keeps the stance from vote time even after the voter switches sides (D7)", async () => {
    const postId = await createPost("for");
    const { session, userId } = await voter("switcher", "against");
    await vote(postId, session);

    await db
      .update(userStances)
      .set({ stance: "for" })
      .where(eq(userStances.userId, userId));
    expect((await scoreOf(postId))?.score).toBe(3);

    await vote(postId, session, "DELETE");
    expect(await scoreOf(postId)).toEqual({ score: 0, count: 0, crossSide: 0 });
  });

  it("shows each reader whether they voted", async () => {
    const postId = await createPost("for");
    const { session } = await voter("rival", "against");
    await vote(postId, session);

    const mine = await get(app, `/posts/${postId}`, session);
    const anonymous = await get(app, `/posts/${postId}`);
    expect(mine.json<PostResponse>().post.votedByMe).toBe(true);
    expect(anonymous.json<PostResponse>().post.votedByMe).toBe(false);
  });
});

describe("sorting a column", () => {
  async function titles(sort: string, query = "") {
    const response = await get(
      app,
      `/questions/${SLUG}/posts?stance=for&sort=${sort}${query}`,
    );
    return response.json<PostListResponse>();
  }

  it("Top orders by score and pages without gaps or repeats", async () => {
    await createPost("for", "Low post", { helpfulScore: 1 });
    await createPost("for", "High post", { helpfulScore: 9 });
    await createPost("for", "Tied A", { helpfulScore: 5 });
    await createPost("for", "Tied B", { helpfulScore: 5 });
    await createPost("for", "Zero post");

    const first = await titles("top", "&limit=2");
    const second = await titles(
      "top",
      `&limit=2&cursor=${String(first.nextCursor)}`,
    );
    const third = await titles(
      "top",
      `&limit=2&cursor=${String(second.nextCursor)}`,
    );
    expect(
      [...first.posts, ...second.posts, ...third.posts].map((p) => p.title),
    ).toEqual(["High post", "Tied B", "Tied A", "Low post", "Zero post"]);
    expect(third.nextCursor).toBeNull();
  });

  it("Hot lets a newer post outrank an older one with a higher score", async () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);
    await createPost("for", "Old favourite", {
      helpfulScore: 20,
      createdAt: hoursAgo(72),
    });
    await createPost("for", "Rising post", {
      helpfulScore: 6,
      createdAt: hoursAgo(1),
    });
    await createPost("for", "Quiet post", {
      helpfulScore: 0,
      createdAt: hoursAgo(2),
    });

    const top = await titles("top");
    const hot = await titles("hot");
    expect(top.posts.map((p) => p.title)).toEqual([
      "Old favourite",
      "Rising post",
      "Quiet post",
    ]);
    expect(hot.posts.map((p) => p.title)).toEqual([
      "Rising post",
      "Old favourite",
      "Quiet post",
    ]);
  });

  it("Hot pages consistently", async () => {
    for (let i = 0; i < 5; i++) {
      await createPost("for", `Post ${String(i)}`, {
        helpfulScore: i * 2,
        createdAt: new Date(Date.now() - i * 60 * 60 * 1000),
      });
    }
    const all = await titles("hot", "&limit=10");
    const first = await titles("hot", "&limit=3");
    const second = await titles(
      "hot",
      `&limit=3&cursor=${String(first.nextCursor)}`,
    );
    expect([...first.posts, ...second.posts].map((p) => p.title)).toEqual(
      all.posts.map((p) => p.title),
    );
  });

  it("rejects cursors that were tampered with", async () => {
    const response = await get(
      app,
      `/questions/${SLUG}/posts?stance=for&sort=top&cursor=bm90LWEtY3Vyc29y`,
    );
    expect(response.statusCode).toBe(400);
  });
});

describe("recomputing scores", () => {
  it("rebuilds weights and scores from the stored stances", async () => {
    const postId = await createPost("for");
    const rival = await voter("rival", "against");
    const middle = await voter("middle", "neutral");
    await vote(postId, rival.session);
    await vote(postId, middle.session);

    // Simulate drift: wrong weights and a wrong total.
    await db.update(postVotes).set({ weight: 99 });
    await db.update(posts).set({ helpfulScore: 7, crossSideCount: 0 });

    await recomputeScores();
    expect(await scoreOf(postId)).toEqual({ score: 5, count: 2, crossSide: 2 });
    const weights = await db.select({ w: postVotes.weight }).from(postVotes);
    expect(weights.map((r) => r.w).sort()).toEqual([2, 3]);
  });
});
