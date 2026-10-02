import type {
  ChallengeListResponse,
  ChallengeResponse,
  CommentResponse,
  NotificationListResponse,
  PostResponse,
  ThreadResponse,
  UnreadCountResponse,
} from "@perspective/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { db } from "../src/db/client";
import {
  challenges,
  comments,
  posts,
  questions,
  users,
} from "../src/db/schema";
import { errorCode, get, post, register, resetDatabase } from "./helpers";

const BODY =
  "This argument skips over the costs for people who live far from the centre.";

let app: FastifyInstance;
let postId: string;

beforeEach(async () => {
  await resetDatabase();
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

async function verifiedUser(username: string) {
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

// Sam writes a post; Alex challenges it.
async function setup() {
  const sam = await verifiedUser("sam");
  const alex = await verifiedUser("alex");
  const [question] = await db
    .insert(questions)
    .values({ title: "Should cities ban cars downtown?", slug: "cars" })
    .returning({ id: questions.id });
  const [row] = await db
    .insert(posts)
    .values({
      questionId: question?.id ?? "",
      authorId: sam.userId,
      stance: "for",
      title: "Streets are for people",
      body: BODY,
    })
    .returning({ id: posts.id });
  postId = row?.id ?? "";
  return { sam, alex };
}

async function challenge(session: string) {
  const response = await post(
    app,
    `/posts/${postId}/challenges`,
    { title: "What about commuters?", body: BODY },
    session,
  );
  if (response.statusCode !== 201) throw new Error(response.body);
  return response.json<ChallengeResponse>().challenge.id;
}

async function reply(
  challengeId: string,
  session: string,
  body: string,
  parentId?: string,
) {
  const response = await post(
    app,
    `/challenges/${challengeId}/comments`,
    { body, parentId },
    session,
  );
  if (response.statusCode !== 201) throw new Error(response.body);
  return response.json<CommentResponse>().comment.id;
}

async function thread(challengeId: string, root?: string) {
  const response = await get(
    app,
    `/challenges/${challengeId}/comments${root ? `?root=${root}` : ""}`,
  );
  return response.json<ThreadResponse>().comments;
}

async function inbox(session: string) {
  return (
    await get(app, "/notifications", session)
  ).json<NotificationListResponse>();
}

describe("challenging a post", () => {
  it("creates the challenge and tells the post's author", async () => {
    const { sam, alex } = await setup();
    const id = await challenge(alex.session);

    const page = (
      await get(app, `/challenges/${id}`)
    ).json<ChallengeResponse>();
    expect(page.challenge).toMatchObject({
      title: "What about commuters?",
      author: { username: "alex" },
      commentCount: 0,
    });
    expect(page.post?.title).toBe("Streets are for people");
    expect(page.question.slug).toBe("cars");

    const { notifications, unreadCount } = await inbox(sam.session);
    expect(unreadCount).toBe(1);
    expect(notifications[0]).toMatchObject({
      type: "post_challenged",
      actor: { username: "alex" },
      challengeId: id,
      read: false,
    });

    const card = (await get(app, `/posts/${postId}`)).json<PostResponse>();
    expect(card.post.challengeCount).toBe(1);
  });

  it("allows one challenge per person per post", async () => {
    const { alex } = await setup();
    await challenge(alex.session);
    const again = await post(
      app,
      `/posts/${postId}/challenges`,
      { title: "Another angle here", body: BODY },
      alex.session,
    );
    expect(again.statusCode).toBe(409);
    expect(errorCode(again)).toBe("ALREADY_CHALLENGED");
  });

  it("doesn't let authors challenge themselves", async () => {
    const { sam } = await setup();
    const response = await post(
      app,
      `/posts/${postId}/challenges`,
      { title: "Arguing with myself", body: BODY },
      sam.session,
    );
    expect(errorCode(response)).toBe("OWN_POST");
  });

  it("needs a verified email", async () => {
    await setup();
    const { session } = await register(app, {
      username: "newbie",
      email: "newbie@example.com",
    });
    const response = await post(
      app,
      `/posts/${postId}/challenges`,
      { title: "What about commuters?", body: BODY },
      session,
    );
    expect(errorCode(response)).toBe("EMAIL_NOT_VERIFIED");
  });

  it("lists a post's challenges, newest first", async () => {
    const { alex } = await setup();
    const first = await challenge(alex.session);
    const kim = await verifiedUser("kim");
    const second = await challenge(kim.session);

    const list = (
      await get(app, `/posts/${postId}/challenges`)
    ).json<ChallengeListResponse>();
    expect(list.challenges.map((c) => c.id)).toEqual([second, first]);
  });

  it("stays readable after the post is deleted (D15)", async () => {
    const { alex } = await setup();
    const id = await challenge(alex.session);
    await db.update(posts).set({ deletedAt: new Date() });

    const page = (
      await get(app, `/challenges/${id}`)
    ).json<ChallengeResponse>();
    expect(page.challenge.id).toBe(id);
    expect(page.post).toBeNull();
  });

  it("hides removed challenges", async () => {
    const { alex } = await setup();
    const id = await challenge(alex.session);
    await db.update(challenges).set({ status: "removed" });
    expect((await get(app, `/challenges/${id}`)).statusCode).toBe(404);
  });
});

describe("threads", () => {
  it("returns replies depth-first and notifies the right people", async () => {
    const { sam, alex } = await setup();
    const id = await challenge(alex.session);
    await db.update(users).set({ emailVerifiedAt: new Date() });
    await inbox(sam.session);
    await post(app, "/notifications/read", undefined, sam.session);

    const top = await reply(
      id,
      sam.session,
      "Buses and trams cover most of it.",
    );
    const answer = await reply(
      id,
      alex.session,
      "Not at night they don't.",
      top,
    );
    await reply(id, sam.session, "Fair, night service needs work.", answer);
    await reply(id, alex.session, "A second top-level point.");

    const comments = await thread(id);
    expect(comments.map((c) => [c.depth, c.body])).toEqual([
      [1, "Buses and trams cover most of it."],
      [2, "Not at night they don't."],
      [3, "Fair, night service needs work."],
      [1, "A second top-level point."],
    ]);

    // Alex: Sam's top-level comment on Alex's challenge, then Sam's reply.
    const alexInbox = await inbox(alex.session);
    expect(
      alexInbox.notifications.filter((n) => n.type === "comment_reply"),
    ).toHaveLength(2);
    // Sam: Alex's reply to Sam's comment. Nobody is notified about their own comments.
    const samInbox = await inbox(sam.session);
    expect(samInbox.unreadCount).toBe(1);
    expect(samInbox.notifications[0]?.actor?.username).toBe("alex");
  });

  it("stops each page at five levels and continues from there", async () => {
    const { alex } = await setup();
    const id = await challenge(alex.session);
    let parent: string | undefined;
    const chain: string[] = [];
    for (let level = 1; level <= 7; level++) {
      parent = await reply(id, alex.session, `Level ${String(level)}`, parent);
      chain.push(parent);
    }

    const page = await thread(id);
    expect(page.map((c) => c.body)).toEqual([
      "Level 1",
      "Level 2",
      "Level 3",
      "Level 4",
      "Level 5",
    ]);
    expect(page.at(-1)?.hasMoreReplies).toBe(true);
    expect(page.slice(0, -1).every((c) => !c.hasMoreReplies)).toBe(true);

    const continued = await thread(id, chain[4]);
    expect(continued.map((c) => c.body)).toEqual([
      "Level 5",
      "Level 6",
      "Level 7",
    ]);
  });

  it("refuses replies past the depth limit", async () => {
    const { alex } = await setup();
    const id = await challenge(alex.session);
    const deep = await reply(id, alex.session, "Deep");
    await db.update(comments).set({ depth: 50 }).where(eq(comments.id, deep));

    const response = await post(
      app,
      `/challenges/${id}/comments`,
      { body: "Even deeper", parentId: deep },
      alex.session,
    );
    expect(response.statusCode).toBe(400);
  });

  it("only allows replying to comments in the same challenge", async () => {
    const { alex } = await setup();
    const first = await challenge(alex.session);
    const kim = await verifiedUser("kim");
    const second = await challenge(kim.session);
    const elsewhere = await reply(
      first,
      alex.session,
      "In the first challenge",
    );

    const response = await post(
      app,
      `/challenges/${second}/comments`,
      { body: "Crossing threads", parentId: elsewhere },
      kim.session,
    );
    expect(response.statusCode).toBe(404);
  });

  it("keeps deleted comments as placeholders so replies stay in place", async () => {
    const { sam, alex } = await setup();
    const id = await challenge(alex.session);
    const top = await reply(id, sam.session, "Something I regret.");
    await reply(id, alex.session, "A reply worth keeping.", top);

    const stranger = await app.inject({
      method: "DELETE",
      url: `/comments/${top}`,
      headers: { origin: "http://localhost:5173" },
      cookies: { session: alex.session },
    });
    expect(stranger.statusCode).toBe(403);

    const own = await app.inject({
      method: "DELETE",
      url: `/comments/${top}`,
      headers: { origin: "http://localhost:5173" },
      cookies: { session: sam.session },
    });
    expect(own.statusCode).toBe(204);

    const comments = await thread(id);
    expect(comments[0]).toMatchObject({
      deleted: true,
      body: "",
      author: null,
    });
    expect(comments[1]?.body).toBe("A reply worth keeping.");

    const page = (
      await get(app, `/challenges/${id}`)
    ).json<ChallengeResponse>();
    expect(page.challenge.commentCount).toBe(1);
  });
});

describe("notifications", () => {
  it("can be marked read", async () => {
    const { sam, alex } = await setup();
    await challenge(alex.session);

    const before = await get(app, "/notifications/unread-count", sam.session);
    expect(before.json<UnreadCountResponse>().unreadCount).toBe(1);

    await post(app, "/notifications/read", undefined, sam.session);
    const after = await inbox(sam.session);
    expect(after.unreadCount).toBe(0);
    expect(after.notifications[0]?.read).toBe(true);
  });

  it("are private", async () => {
    expect((await get(app, "/notifications")).statusCode).toBe(401);
  });
});
