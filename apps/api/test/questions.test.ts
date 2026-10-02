import type {
  QuestionListResponse,
  QuestionResponse,
} from "@perspective/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { db } from "../src/db/client";
import { questions, users } from "../src/db/schema";
import { slugify } from "../src/modules/questions/slugs";
import { errorCode, get, post, register, resetDatabase } from "./helpers";

let app: FastifyInstance;

beforeEach(async () => {
  await resetDatabase();
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

async function verifiedUser(username = "sam") {
  const { session, body } = await register(app, {
    username,
    email: `${username}@example.com`,
  });
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.id, body.user.id));
  return session;
}

async function ask(session: string, title: string, description = "") {
  const response = await post(
    app,
    "/questions",
    { title, description },
    session,
  );
  if (response.statusCode !== 201) {
    throw new Error(`ask failed: ${response.body}`);
  }
  return response.json<QuestionResponse>().question;
}

// Inserts directly, bypassing the daily limit, for list and search tests.
async function seed(titles: string[]) {
  for (const title of titles) {
    await db.insert(questions).values({ title, slug: crypto.randomUUID() });
  }
}

describe("asking a question", () => {
  it("publishes it with a readable slug", async () => {
    const session = await verifiedUser();
    const question = await ask(
      session,
      "  Should voting   be mandatory? ",
      "Some countries fine people who don't vote.",
    );

    expect(question).toMatchObject({
      title: "Should voting be mandatory?",
      slug: "should-voting-be-mandatory",
      author: { username: "sam" },
    });

    const page = await get(app, `/questions/${question.slug}`);
    expect(page.json<QuestionResponse>().question.id).toBe(question.id);
  });

  it("needs a logged-in user with a verified email", async () => {
    const anonymous = await post(app, "/questions", {
      title: "Should voting be mandatory?",
    });
    expect(anonymous.statusCode).toBe(401);

    const { session } = await register(app);
    const unverified = await post(
      app,
      "/questions",
      { title: "Should voting be mandatory?" },
      session,
    );
    expect(unverified.statusCode).toBe(403);
    expect(errorCode(unverified)).toBe("EMAIL_NOT_VERIFIED");
  });

  it("must be phrased as a question", async () => {
    const session = await verifiedUser();
    const response = await post(
      app,
      "/questions",
      { title: "Voting should be mandatory." },
      session,
    );
    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe("VALIDATION_FAILED");
  });

  it("gives repeated titles their own slugs", async () => {
    const session = await verifiedUser();
    const first = await ask(session, "Is remote work better?");
    const second = await ask(session, "Is remote work better?");
    expect(first.slug).toBe("is-remote-work-better");
    expect(second.slug).toBe("is-remote-work-better-2");
  });

  it("allows five questions a day per person", async () => {
    const session = await verifiedUser();
    for (let i = 1; i <= 5; i++) {
      await ask(session, `Is question number ${String(i)} fine?`);
    }
    const sixth = await post(
      app,
      "/questions",
      { title: "Is one more question fine?" },
      session,
    );
    expect(sixth.statusCode).toBe(429);
    expect(errorCode(sixth)).toBe("RATE_LIMITED");

    const someoneElse = await verifiedUser("alex");
    await ask(someoneElse, "Can other people still ask?");
  });

  it("keeps questions when the author deletes their account", async () => {
    const session = await verifiedUser();
    const question = await ask(session, "Should voting be mandatory?");
    await db.delete(users);

    const page = await get(app, `/questions/${question.slug}`);
    expect(page.json<QuestionResponse>().question.author).toBeNull();
  });
});

describe("browsing", () => {
  it("lists newest first, page by page, without gaps or repeats", async () => {
    await seed(
      Array.from({ length: 5 }, (_, i) => `Is test question ${String(i)} ok?`),
    );

    const first = (
      await get(app, "/questions?limit=2")
    ).json<QuestionListResponse>();
    expect(first.questions.map((q) => q.title)).toEqual([
      "Is test question 4 ok?",
      "Is test question 3 ok?",
    ]);

    // A new question arriving between pages must not shift the next page.
    await seed(["Is a brand new question ok?"]);

    const second = (
      await get(app, `/questions?limit=2&cursor=${String(first.nextCursor)}`)
    ).json<QuestionListResponse>();
    expect(second.questions.map((q) => q.title)).toEqual([
      "Is test question 2 ok?",
      "Is test question 1 ok?",
    ]);

    const last = (
      await get(app, `/questions?limit=2&cursor=${String(second.nextCursor)}`)
    ).json<QuestionListResponse>();
    expect(last.questions.map((q) => q.title)).toEqual([
      "Is test question 0 ok?",
    ]);
    expect(last.nextCursor).toBeNull();
  });

  it("hides removed questions everywhere", async () => {
    const session = await verifiedUser();
    const question = await ask(session, "Should this be removed?");
    await db
      .update(questions)
      .set({ status: "removed" })
      .where(eq(questions.id, question.id));

    expect((await get(app, `/questions/${question.slug}`)).statusCode).toBe(
      404,
    );
    const list = (await get(app, "/questions")).json<QuestionListResponse>();
    expect(list.questions).toHaveLength(0);
  });

  it("returns 404 for unknown slugs", async () => {
    const response = await get(app, "/questions/does-not-exist");
    expect(response.statusCode).toBe(404);
    expect(errorCode(response)).toBe("NOT_FOUND");
  });
});

describe("search", () => {
  it("matches word forms and ranks title matches first", async () => {
    const session = await verifiedUser();
    await ask(
      session,
      "Should cities ban cars downtown?",
      "Drivers might vote against it.",
    );
    await ask(session, "Should voting be mandatory?");

    const response = await get(app, "/questions/search?q=votes");
    const titles = response
      .json<QuestionListResponse>()
      .questions.map((q) => q.title);
    expect(titles).toEqual([
      "Should voting be mandatory?",
      "Should cities ban cars downtown?",
    ]);
  });

  it("returns nothing for unrelated words", async () => {
    await seed(["Should voting be mandatory?"]);
    const response = await get(app, "/questions/search?q=astronomy");
    expect(response.json<QuestionListResponse>().questions).toHaveLength(0);
  });
});

describe("similar questions", () => {
  it("finds an existing question despite typos", async () => {
    await seed([
      "Should voting be mandatory?",
      "Is remote work better than the office?",
    ]);
    const response = await get(
      app,
      `/questions/similar?title=${encodeURIComponent("shoud votng be mandatory")}`,
    );
    const titles = response
      .json<QuestionListResponse>()
      .questions.map((q) => q.title);
    expect(titles).toEqual(["Should voting be mandatory?"]);
  });
});

describe("slugify", () => {
  it("makes readable, URL-safe slugs", () => {
    expect(slugify("Should voting be mandatory?")).toBe(
      "should-voting-be-mandatory",
    );
    expect(slugify("Café ou thé : lequel est meilleur ?")).toBe(
      "cafe-ou-the-lequel-est-meilleur",
    );
    expect(slugify("क्या मतदान अनिवार्य होना चाहिए?")).toBe(
      "क्या-मतदान-अनिवार्य-होना-चाहिए",
    );
    expect(slugify("???")).toBe("question");
    expect(slugify("word ".repeat(40)).length).toBeLessThanOrEqual(80);
  });
});
