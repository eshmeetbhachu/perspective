import type {
  PostListResponse,
  QuestionListResponse,
} from "@perspective/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { db } from "../src/db/client";
import { posts, questions, userStances, users } from "../src/db/schema";
import { get, post, register, resetDatabase } from "./helpers";

const SLUG = "should-museums-be-free";
const COLUMN = `/questions/${SLUG}/posts?stance=for`;
const DAY_MS = 24 * 60 * 60 * 1000;

let app: FastifyInstance;
let questionId: string;
let postId: string;

beforeEach(async () => {
  await resetDatabase();
  app = await buildApp();
  const [question] = await db
    .insert(questions)
    .values({ title: "Should museums be free?", slug: SLUG })
    .returning({ id: questions.id });
  questionId = question?.id ?? "";
  const [row] = await db
    .insert(posts)
    .values({
      questionId,
      stance: "for",
      title: "Culture for everyone",
      body: "Free entry brings in people who would never pay to visit.",
    })
    .returning({ id: posts.id });
  postId = row?.id ?? "";
});

afterEach(async () => {
  await app.close();
});

// A verified, two-day-old account that stands against, so it may vote.
async function member(username: string, role: "user" | "moderator" = "user") {
  const { session, body } = await register(app, {
    username,
    email: `${username}@example.com`,
  });
  await db
    .update(users)
    .set({
      emailVerifiedAt: new Date(),
      createdAt: new Date(Date.now() - 2 * DAY_MS),
      role,
    })
    .where(eq(users.id, body.user.id));
  await db
    .insert(userStances)
    .values({ userId: body.user.id, questionId, stance: "against" });
  return session;
}

describe("response cache for logged-out visitors", () => {
  it("serves the second identical request from the cache", async () => {
    const first = await get(app, COLUMN);
    const second = await get(app, COLUMN);
    expect(first.headers["x-cache"]).toBe("miss");
    expect(second.headers["x-cache"]).toBe("hit");
    expect(second.headers["content-type"]).toContain("application/json");
    expect(second.body).toBe(first.body);
  });

  it("never caches what a logged-in member sees", async () => {
    const session = await member("rhea");
    await get(app, COLUMN);
    const response = await get(app, COLUMN, session);
    expect(response.headers["x-cache"]).toBeUndefined();
  });

  it("shows a new vote to the next logged-out visitor", async () => {
    await get(app, COLUMN);
    const session = await member("omar");
    const voted = await app.inject({
      method: "PUT",
      url: `/posts/${postId}/vote`,
      headers: { origin: "http://localhost:5173" },
      cookies: { session },
    });
    expect(voted.statusCode).toBe(200);

    const after = await get(app, COLUMN);
    expect(after.headers["x-cache"]).toBe("miss");
    expect(after.json<PostListResponse>().posts[0]?.helpfulScore).toBe(3);
  });

  it("shows a new question in the list right away", async () => {
    await get(app, "/questions");
    expect((await get(app, "/questions")).headers["x-cache"]).toBe("hit");

    const session = await member("lena");
    const asked = await post(
      app,
      "/questions",
      { title: "Should libraries open on Sundays?", description: "" },
      session,
    );
    expect(asked.statusCode).toBe(201);

    const after = await get(app, "/questions");
    expect(after.headers["x-cache"]).toBe("miss");
    expect(
      after.json<QuestionListResponse>().questions.map((q) => q.title),
    ).toContain("Should libraries open on Sundays?");
  });

  it("drops a post removed by a moderator", async () => {
    await get(app, COLUMN);
    const session = await member("mod_mia", "moderator");
    const removed = await post(
      app,
      `/moderation/post/${postId}/remove`,
      { reason: "Off topic" },
      session,
    );
    expect(removed.statusCode).toBe(204);

    const after = await get(app, COLUMN);
    expect(after.json<PostListResponse>().posts).toHaveLength(0);
  });
});
