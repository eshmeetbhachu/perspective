import type {
  MyStanceResponse,
  PostListResponse,
  PostResponse,
  Stance,
} from "@perspective/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { db } from "../src/db/client";
import {
  posts,
  questions,
  stanceHistory,
  userStances,
  users,
} from "../src/db/schema";
import { errorCode, get, post, register, resetDatabase } from "./helpers";

let app: FastifyInstance;
const SLUG = "should-voting-be-mandatory";
const BODY =
  "Turnout would better reflect everyone, not only the most motivated voters.";

beforeEach(async () => {
  await resetDatabase();
  app = await buildApp();
  await db
    .insert(questions)
    .values({ title: "Should voting be mandatory?", slug: SLUG });
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
  return { session, userId: body.user.id };
}

function setStance(session: string, stance: Stance, slug = SLUG) {
  return app.inject({
    method: "PUT",
    url: `/questions/${slug}/stance`,
    payload: { stance },
    headers: { origin: "http://localhost:5173" },
    cookies: { session },
  });
}

// Moves the last stance change back in time, past the 24-hour cooldown.
async function skipCooldown(userId: string) {
  await db
    .update(userStances)
    .set({ updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
    .where(eq(userStances.userId, userId));
}

function writePost(session: string, title = "Everyone gets a say") {
  return post(app, `/questions/${SLUG}/posts`, { title, body: BODY }, session);
}

async function column(stance: Stance, query = "") {
  const response = await get(
    app,
    `/questions/${SLUG}/posts?stance=${stance}${query}`,
  );
  return response.json<PostListResponse>();
}

describe("stances", () => {
  it("can be declared, and then changed only once a day", async () => {
    const { session, userId } = await verifiedUser();

    const first = await setStance(session, "for");
    expect(first.json<MyStanceResponse>().stance).toBe("for");
    expect(first.json<MyStanceResponse>().changeableAt).not.toBeNull();

    const tooSoon = await setStance(session, "against");
    expect(tooSoon.statusCode).toBe(429);
    expect(errorCode(tooSoon)).toBe("STANCE_COOLDOWN");

    await skipCooldown(userId);
    const later = await setStance(session, "against");
    expect(later.json<MyStanceResponse>().stance).toBe("against");

    const history = await db
      .select({ from: stanceHistory.fromStance, to: stanceHistory.toStance })
      .from(stanceHistory)
      .orderBy(stanceHistory.id);
    expect(history).toEqual([
      { from: null, to: "for" },
      { from: "for", to: "against" },
    ]);
  });

  it("treats choosing the same stance again as no change", async () => {
    const { session } = await verifiedUser();
    await setStance(session, "neutral");
    const again = await setStance(session, "neutral");
    expect(again.statusCode).toBe(200);
    expect(await db.select().from(stanceHistory)).toHaveLength(1);
  });

  it("lets only one of two simultaneous changes through", async () => {
    const { session, userId } = await verifiedUser();
    await setStance(session, "for");
    await skipCooldown(userId);

    const results = await Promise.all([
      setStance(session, "against"),
      setStance(session, "neutral"),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 429]);
    expect(await db.select().from(stanceHistory)).toHaveLength(2);
  });

  it("reports the reader's stance, or null before declaring", async () => {
    const { session } = await verifiedUser();
    const before = await get(app, `/questions/${SLUG}/stance`, session);
    expect(before.json<MyStanceResponse>()).toEqual({
      stance: null,
      changeableAt: null,
    });
  });

  it("needs a session and an existing question", async () => {
    expect((await get(app, `/questions/${SLUG}/stance`)).statusCode).toBe(401);
    const { session } = await verifiedUser();
    expect(
      (await setStance(session, "for", "no-such-question")).statusCode,
    ).toBe(404);
  });
});

describe("writing posts", () => {
  it("needs a verified email and a declared stance", async () => {
    const { session: unverified } = await register(app, {
      username: "new_user",
      email: "new@example.com",
    });
    expect(errorCode(await writePost(unverified))).toBe("EMAIL_NOT_VERIFIED");

    const { session } = await verifiedUser();
    const response = await writePost(session);
    expect(response.statusCode).toBe(409);
    expect(errorCode(response)).toBe("STANCE_REQUIRED");
  });

  it("puts the post in the author's column", async () => {
    const { session } = await verifiedUser();
    await setStance(session, "against");
    const response = await writePost(session);

    expect(response.statusCode).toBe(201);
    expect(response.json<PostResponse>().post).toMatchObject({
      stance: "against",
      title: "Everyone gets a say",
      author: { username: "sam" },
      editedAt: null,
    });
    expect((await column("against")).posts).toHaveLength(1);
    expect((await column("for")).posts).toHaveLength(0);
  });

  it("allows one live post per person per side", async () => {
    const { session, userId } = await verifiedUser();
    await setStance(session, "for");
    await writePost(session);

    const second = await writePost(session, "Another angle");
    expect(second.statusCode).toBe(409);
    expect(errorCode(second)).toBe("ALREADY_POSTED");

    // Changing sides opens the other column; the old post stays where it was.
    await skipCooldown(userId);
    await setStance(session, "neutral");
    expect((await writePost(session, "A neutral take")).statusCode).toBe(201);
    expect((await column("for")).posts).toHaveLength(1);
    expect((await column("neutral")).posts).toHaveLength(1);
  });

  it("rejects posts that are too short", async () => {
    const { session } = await verifiedUser();
    await setStance(session, "for");
    const response = await post(
      app,
      `/questions/${SLUG}/posts`,
      { title: "Yes", body: "Because." },
      session,
    );
    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe("VALIDATION_FAILED");
  });

  it("allows ten posts a day per person", async () => {
    const { session, userId } = await verifiedUser();
    for (let i = 0; i < 10; i++) {
      const [question] = await db
        .insert(questions)
        .values({
          title: `Is test question ${String(i)} fine?`,
          slug: `q-${String(i)}`,
        })
        .returning({ id: questions.id });
      await db.insert(posts).values({
        questionId: question?.id ?? "",
        authorId: userId,
        stance: "for",
        title: "Earlier post",
        body: BODY,
      });
    }
    await setStance(session, "for");
    const eleventh = await writePost(session);
    expect(eleventh.statusCode).toBe(429);
    expect(errorCode(eleventh)).toBe("RATE_LIMITED");
  });
});

describe("editing and deleting", () => {
  async function samsPost() {
    const sam = await verifiedUser();
    await setStance(sam.session, "for");
    const { post: created } = (
      await writePost(sam.session)
    ).json<PostResponse>();
    return { ...sam, postId: created.id };
  }

  function edit(postId: string, session?: string) {
    return app.inject({
      method: "PATCH",
      url: `/posts/${postId}`,
      payload: { title: "Everyone gets a say (updated)", body: BODY },
      headers: { origin: "http://localhost:5173" },
      cookies: session ? { session } : {},
    });
  }

  function remove(postId: string, session?: string) {
    return app.inject({
      method: "DELETE",
      url: `/posts/${postId}`,
      headers: { origin: "http://localhost:5173" },
      cookies: session ? { session } : {},
    });
  }

  it("lets the author edit, marking the post as edited", async () => {
    const { session, postId } = await samsPost();
    const response = await edit(postId, session);
    expect(response.statusCode).toBe(200);
    expect(response.json<PostResponse>().post.title).toBe(
      "Everyone gets a say (updated)",
    );
    expect(response.json<PostResponse>().post.editedAt).not.toBeNull();
  });

  it("stops anyone else from editing or deleting", async () => {
    const { postId } = await samsPost();
    const alex = await verifiedUser("alex");

    expect((await edit(postId)).statusCode).toBe(401);
    expect((await edit(postId, alex.session)).statusCode).toBe(403);
    expect((await remove(postId, alex.session)).statusCode).toBe(403);
  });

  it("soft-deletes: hidden everywhere, but the row is kept", async () => {
    const { session, postId } = await samsPost();
    expect((await remove(postId, session)).statusCode).toBe(204);

    expect((await column("for")).posts).toHaveLength(0);
    expect((await get(app, `/posts/${postId}`)).statusCode).toBe(404);
    expect((await edit(postId, session)).statusCode).toBe(404);

    const [row] = await db.select().from(posts).where(eq(posts.id, postId));
    expect(row?.deletedAt).not.toBeNull();

    // The side is free again for a new post.
    expect((await writePost(session)).statusCode).toBe(201);
  });

  it("keeps posts when the author's account is deleted", async () => {
    const { userId, postId } = await samsPost();
    await db.delete(users).where(eq(users.id, userId));
    const response = await get(app, `/posts/${postId}`);
    expect(response.json<PostResponse>().post.author).toBeNull();
  });
});

describe("columns", () => {
  it("page newest first by cursor", async () => {
    const question = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.slug, SLUG));
    for (let i = 0; i < 5; i++) {
      await db.insert(posts).values({
        questionId: question[0]?.id ?? "",
        stance: "neutral",
        title: `Neutral post ${String(i)}`,
        body: BODY,
      });
    }

    const first = await column("neutral", "&limit=2");
    expect(first.posts.map((p) => p.title)).toEqual([
      "Neutral post 4",
      "Neutral post 3",
    ]);
    const rest = await column(
      "neutral",
      `&limit=10&cursor=${String(first.nextCursor)}`,
    );
    expect(rest.posts.map((p) => p.title)).toEqual([
      "Neutral post 2",
      "Neutral post 1",
      "Neutral post 0",
    ]);
    expect(rest.nextCursor).toBeNull();
  });

  it("disappear with their question", async () => {
    await db
      .update(questions)
      .set({ status: "removed" })
      .where(and(eq(questions.slug, SLUG)));
    expect(
      (await get(app, `/questions/${SLUG}/posts?stance=for`)).statusCode,
    ).toBe(404);
  });
});
