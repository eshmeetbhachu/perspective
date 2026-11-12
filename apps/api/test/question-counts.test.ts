import type {
  QuestionListResponse,
  QuestionResponse,
  Stance,
} from "@perspective/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { env } from "../src/config/env";
import { db } from "../src/db/client";
import { posts, questions, users, userStances } from "../src/db/schema";
import { errorCode, get, register, resetDatabase } from "./helpers";

const SLUG = "should-libraries-open-on-sundays";
const BODY =
  "A careful argument that is comfortably longer than thirty characters.";

let app: FastifyInstance;
let questionId: string;

beforeEach(async () => {
  await resetDatabase();
  app = await buildApp();
  const [question] = await db
    .insert(questions)
    .values({ title: "Should libraries open on Sundays?", slug: SLUG })
    .returning({ id: questions.id });
  questionId = question?.id ?? "";
});

afterEach(async () => {
  await app.close();
});

async function member(username: string) {
  const { session, body } = await register(app, {
    username,
    email: `${username}@example.com`,
  });
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.id, body.user.id));
  return { session, userId: body.user.id };
}

function setStance(session: string, stance: Stance) {
  return app.inject({
    method: "PUT",
    url: `/questions/${SLUG}/stance`,
    payload: { stance },
    headers: { origin: env.WEB_ORIGIN },
    cookies: { session },
  });
}

async function counts() {
  const response = await get(app, `/questions/${SLUG}`);
  return response.json<QuestionResponse>().question;
}

describe("stance counts", () => {
  it("count each new stance on its side", async () => {
    const sam = await member("sam");
    const kim = await member("kim");
    expect((await setStance(sam.session, "for")).statusCode).toBe(200);
    expect((await setStance(kim.session, "against")).statusCode).toBe(200);

    expect((await counts()).stanceCounts).toEqual({
      for: 1,
      neutral: 0,
      against: 1,
    });
  });

  it("move a person when they change sides", async () => {
    const sam = await member("sam");
    await setStance(sam.session, "for");
    // Past the 24-hour cooldown.
    await db
      .update(userStances)
      .set({ updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(userStances.userId, sam.userId));

    expect((await setStance(sam.session, "neutral")).statusCode).toBe(200);
    expect((await counts()).stanceCounts).toEqual({
      for: 0,
      neutral: 1,
      against: 0,
    });
  });

  it("don't change when someone picks the side they already hold", async () => {
    const sam = await member("sam");
    await setStance(sam.session, "for");
    await setStance(sam.session, "for");
    expect((await counts()).stanceCounts.for).toBe(1);
  });

  it("count only live posts", async () => {
    await db.insert(posts).values([
      { questionId, stance: "for", title: "Open them", body: BODY },
      { questionId, stance: "against", title: "Pay staff", body: BODY },
      {
        questionId,
        stance: "against",
        title: "Deleted one",
        body: BODY,
        deletedAt: new Date(),
      },
    ]);
    expect((await counts()).postCount).toBe(2);
  });
});

describe("question sorts", () => {
  // Titles name the order each sort should produce.
  beforeEach(async () => {
    await db.insert(questions).values([
      {
        title: "Busy but one-sided?",
        slug: "busy",
        forCount: 90,
        againstCount: 10,
      },
      {
        title: "Quiet but even split?",
        slug: "quiet",
        forCount: 5,
        againstCount: 5,
      },
      {
        title: "Busy and evenly split?",
        slug: "split",
        forCount: 40,
        neutralCount: 5,
        againstCount: 45,
      },
    ]);
  });

  async function titles(url: string) {
    const response = await get(app, url);
    expect(response.statusCode).toBe(200);
    return response.json<QuestionListResponse>();
  }

  it("most active puts the most people first", async () => {
    const { questions: list } = await titles("/questions?sort=active");
    expect(list.map((q) => q.slug)).toEqual(["busy", "split", "quiet", SLUG]);
  });

  it("most divided puts big groups on both sides first", async () => {
    const { questions: list } = await titles("/questions?sort=divided");
    expect(list.map((q) => q.slug).slice(0, 3)).toEqual([
      "split",
      "busy",
      "quiet",
    ]);
  });

  it("pages through a ranked sort without gaps or repeats", async () => {
    const first = await titles("/questions?sort=active&limit=2");
    expect(first.nextCursor).toMatch(/^\d+:/);
    const second = await titles(
      `/questions?sort=active&limit=2&cursor=${encodeURIComponent(first.nextCursor ?? "")}`,
    );
    expect(
      [...first.questions, ...second.questions].map((q) => q.slug),
    ).toEqual(["busy", "split", "quiet", SLUG]);
    expect(second.nextCursor).toBeNull();
  });

  it("rejects a cursor from another sort", async () => {
    const response = await get(
      app,
      `/questions?sort=active&cursor=${questionId}`,
    );
    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe("BAD_REQUEST");
  });
});
