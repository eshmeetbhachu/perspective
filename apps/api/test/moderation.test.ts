import type {
  AuditResponse,
  ChallengeResponse,
  QueueResponse,
  ThreadResponse,
  UserRole,
} from "@perspective/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { db } from "../src/db/client";
import {
  auditLog,
  challenges,
  comments,
  posts,
  questions,
  reports,
  users,
} from "../src/db/schema";
import { errorCode, get, post, register, resetDatabase } from "./helpers";

const BODY =
  "A careful argument that is comfortably longer than thirty characters.";

let app: FastifyInstance;

beforeEach(async () => {
  await resetDatabase();
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

async function person(username: string, role: UserRole = "user", ageDays = 30) {
  const { session, body } = await register(app, {
    username,
    email: `${username}@example.com`,
  });
  await db
    .update(users)
    .set({
      role,
      emailVerifiedAt: new Date(),
      createdAt: new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000),
    })
    .where(eq(users.id, body.user.id));
  return { session, userId: body.user.id };
}

// Sam's question with Sam's post on it.
async function content() {
  const sam = await person("sam");
  const [question] = await db
    .insert(questions)
    .values({
      title: "Should cities ban cars?",
      slug: "cars",
      createdBy: sam.userId,
    })
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
  return { sam, questionId: question?.id ?? "", postId: row?.id ?? "" };
}

function report(
  session: string,
  targetType: string,
  targetId: string,
  reason = "spam",
) {
  return post(app, "/reports", { targetType, targetId, reason }, session);
}

function moderate(session: string, path: string, reason = "Breaks the rules") {
  return post(app, `/moderation/${path}`, { reason }, session);
}

async function queue(session: string) {
  return (await get(app, "/moderation/queue", session)).json<QueueResponse>();
}

async function auditFor(targetId: string) {
  return db.select().from(auditLog).where(eq(auditLog.targetId, targetId));
}

describe("reporting", () => {
  it("records one report per person per item", async () => {
    const { postId } = await content();
    const alex = await person("alex");

    expect((await report(alex.session, "post", postId)).statusCode).toBe(204);
    expect(
      (await report(alex.session, "post", postId, "hate")).statusCode,
    ).toBe(204);
    expect(await db.select().from(reports)).toHaveLength(1);
  });

  it("refuses your own content, missing content and anonymous reports", async () => {
    const { sam, postId } = await content();
    expect((await report(sam.session, "post", postId)).statusCode).toBe(403);

    const alex = await person("alex");
    expect(
      (
        await report(
          alex.session,
          "post",
          "01a0fd6d-0000-7000-8000-000000000000",
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await post(app, "/reports", {
          targetType: "post",
          targetId: postId,
          reason: "spam",
        })
      ).statusCode,
    ).toBe(401);
  });

  it("limits reports to 20 a day per person", async () => {
    const { postId } = await content();
    const alex = await person("alex");
    for (let i = 0; i < 20; i++) {
      await db.insert(reports).values({
        reporterId: alex.userId,
        targetType: "comment",
        targetId: crypto.randomUUID(),
        reason: "spam",
      });
    }
    expect(errorCode(await report(alex.session, "post", postId))).toBe(
      "RATE_LIMITED",
    );
  });
});

describe("the review queue", () => {
  it("is only for moderators and admins", async () => {
    await content();
    const alex = await person("alex");
    expect((await get(app, "/moderation/queue", alex.session)).statusCode).toBe(
      403,
    );
    const admin = await person("boss", "admin");
    expect(
      (await get(app, "/moderation/queue", admin.session)).statusCode,
    ).toBe(200);
  });

  it("groups reports per item, most reported first, with a preview", async () => {
    const { questionId, postId } = await content();
    const mod = await person("mod", "moderator");
    for (const name of ["alex", "kim"]) {
      const p = await person(name);
      await report(
        p.session,
        "post",
        postId,
        name === "alex" ? "spam" : "hate",
      );
    }
    const lee = await person("lee");
    await report(lee.session, "question", questionId, "off_topic");

    const { items } = await queue(mod.session);
    expect(items.map((i) => [i.targetType, i.reportCount])).toEqual([
      ["post", 2],
      ["question", 1],
    ]);
    expect(items[0]?.reasons.sort()).toEqual(["hate", "spam"]);
    expect(items[0]?.preview).toMatchObject({
      title: "Streets are for people",
      author: { username: "sam" },
      link: `/posts/${postId}`,
      removed: false,
    });
  });
});

describe("removing and restoring", () => {
  it("hides a post, closes its reports, and logs who did it and why", async () => {
    const { postId } = await content();
    const mod = await person("mod", "moderator");
    const alex = await person("alex");
    await report(alex.session, "post", postId);

    const removed = await moderate(
      mod.session,
      `post/${postId}/remove`,
      "Spam link",
    );
    expect(removed.statusCode).toBe(204);
    expect((await get(app, `/posts/${postId}`)).statusCode).toBe(404);
    expect((await queue(mod.session)).items).toHaveLength(0);

    const [closed] = await db.select().from(reports);
    expect(closed).toMatchObject({
      status: "resolved",
      resolvedBy: mod.userId,
    });
    const [entry] = await auditFor(postId);
    expect(entry).toMatchObject({
      action: "remove",
      actorId: mod.userId,
      reason: "Spam link",
    });

    await moderate(mod.session, `post/${postId}/restore`, "Removed by mistake");
    expect((await get(app, `/posts/${postId}`)).statusCode).toBe(200);
    expect((await auditFor(postId)).map((e) => e.action).sort()).toEqual([
      "remove",
      "restore",
    ]);
  });

  it("hides questions and challenges", async () => {
    const { questionId, postId } = await content();
    const mod = await person("mod", "moderator");
    const alex = await person("alex");
    const [challenge] = await db
      .insert(challenges)
      .values({
        postId,
        createdBy: alex.userId,
        title: "A fair challenge",
        body: BODY,
      })
      .returning({ id: challenges.id });
    const challengeId = challenge?.id ?? "";

    await moderate(mod.session, `challenge/${challengeId}/remove`);
    expect((await get(app, `/challenges/${challengeId}`)).statusCode).toBe(404);

    await moderate(mod.session, `question/${questionId}/remove`);
    expect((await get(app, "/questions/cars")).statusCode).toBe(404);
  });

  it("leaves removed comments as placeholders in their thread", async () => {
    const { postId } = await content();
    const mod = await person("mod", "moderator");
    const alex = await person("alex");
    const [challenge] = await db
      .insert(challenges)
      .values({
        postId,
        createdBy: alex.userId,
        title: "A fair challenge",
        body: BODY,
      })
      .returning({ id: challenges.id });
    const challengeId = challenge?.id ?? "";
    const [comment] = await db
      .insert(comments)
      .values({
        challengeId,
        authorId: alex.userId,
        body: "Something nasty",
        depth: 1,
      })
      .returning({ id: comments.id });

    await moderate(mod.session, `comment/${comment?.id ?? ""}/remove`);
    const thread = (
      await get(app, `/challenges/${challengeId}/comments`)
    ).json<ThreadResponse>();
    expect(thread.comments[0]).toMatchObject({
      removed: true,
      body: "",
      author: null,
    });
    const page = (
      await get(app, `/challenges/${challengeId}`)
    ).json<ChallengeResponse>();
    expect(page.challenge.commentCount).toBe(0);
  });

  it("can dismiss reports and keep the content", async () => {
    const { postId } = await content();
    const mod = await person("mod", "moderator");
    const alex = await person("alex");
    await report(alex.session, "post", postId);

    await post(
      app,
      `/moderation/post/${postId}/dismiss`,
      undefined,
      mod.session,
    );
    expect((await queue(mod.session)).items).toHaveLength(0);
    expect((await get(app, `/posts/${postId}`)).statusCode).toBe(200);
    expect((await auditFor(postId))[0]?.action).toBe("dismiss_reports");
  });

  it("is forbidden to regular users", async () => {
    const { postId } = await content();
    const alex = await person("alex");
    expect(
      (await moderate(alex.session, `post/${postId}/remove`)).statusCode,
    ).toBe(403);
  });
});

describe("bans", () => {
  it("log the user out everywhere and block logging in until unbanned", async () => {
    const { sam } = await content();
    const mod = await person("mod", "moderator");

    expect(
      (await moderate(mod.session, "users/SAM/ban", "Repeated spam"))
        .statusCode,
    ).toBe(204);
    expect((await get(app, "/auth/me", sam.session)).statusCode).toBe(401);
    const login = () =>
      post(app, "/auth/login", {
        email: "sam@example.com",
        password: "correct horse battery",
      });
    expect((await login()).statusCode).toBe(403);
    expect((await auditFor(sam.userId))[0]).toMatchObject({
      action: "ban_user",
      reason: "Repeated spam",
    });

    await moderate(mod.session, "users/sam/unban", "Appeal accepted");
    expect((await login()).statusCode).toBe(200);
  });

  it("only reach people ranked below the moderator", async () => {
    const mod = await person("mod", "moderator");
    await person("other_mod", "moderator");
    await person("boss", "admin");

    expect(
      (await moderate(mod.session, "users/other_mod/ban")).statusCode,
    ).toBe(403);
    expect((await moderate(mod.session, "users/boss/ban")).statusCode).toBe(
      403,
    );
    expect((await moderate(mod.session, "users/mod/ban")).statusCode).toBe(403);

    const admin = await person("admin2", "admin");
    expect(
      (await moderate(admin.session, "users/other_mod/ban")).statusCode,
    ).toBe(204);
  });
});

describe("the audit log", () => {
  it("lists entries for moderators", async () => {
    const { postId } = await content();
    const mod = await person("mod", "moderator");
    await moderate(mod.session, `post/${postId}/remove`, "Spam link");

    const { entries } = (
      await get(app, "/moderation/audit", mod.session)
    ).json<AuditResponse>();
    expect(entries.find((e) => e.targetId === postId)).toMatchObject({
      action: "remove",
      actor: { username: "mod" },
      reason: "Spam link",
    });
  });

  it("can't be edited or deleted by the app's database role", async () => {
    const { postId } = await content();
    const mod = await person("mod", "moderator");
    await moderate(mod.session, `post/${postId}/remove`, "Spam link");

    await expect(
      db
        .update(auditLog)
        .set({ reason: "nothing happened" })
        .where(eq(auditLog.targetId, postId)),
    ).rejects.toThrow();
    await expect(
      db.delete(auditLog).where(eq(auditLog.targetId, postId)),
    ).rejects.toThrow();
  });
});

describe("automated checks", () => {
  async function challengeWith(session: string, postId: string) {
    const response = await post(
      app,
      `/posts/${postId}/challenges`,
      { title: "A fair challenge", body: BODY },
      session,
    );
    return response.json<ChallengeResponse>().challenge.id;
  }

  it("refuse the same comment twice within a day", async () => {
    const { postId } = await content();
    const alex = await person("alex");
    const challengeId = await challengeWith(alex.session, postId);
    const say = (body: string) =>
      post(app, `/challenges/${challengeId}/comments`, { body }, alex.session);

    expect((await say("Buy cheap watches at example dot com")).statusCode).toBe(
      201,
    );
    const again = await say("  buy CHEAP watches   at example dot com ");
    expect(again.statusCode).toBe(409);
    expect(errorCode(again)).toBe("DUPLICATE_CONTENT");
  });

  it("flag link-heavy posts from new accounts for review", async () => {
    const { questionId } = await content();
    const newbie = await person("newbie", "user", 1);
    await db.insert(questions).values({ title: "Is this fine?", slug: "fine" });
    await db.execute(
      `insert into user_stances (user_id, question_id, stance) values ('${newbie.userId}', '${questionId}', 'against')`,
    );
    const links =
      "See https://a.example, https://b.example and https://c.example for more.";
    const response = await post(
      app,
      "/questions/cars/posts",
      { title: "Read these first", body: links },
      newbie.session,
    );
    expect(response.statusCode).toBe(201);

    const [flag] = await db
      .select()
      .from(reports)
      .where(
        and(eq(reports.reason, "automated"), eq(reports.targetType, "post")),
      );
    expect(flag?.reporterId).toBeNull();
    expect(flag?.details).toContain("3 links from an account under 3 days old");
  });

  it("flag very fast commenting for review", async () => {
    const { postId } = await content();
    const alex = await person("alex");
    const challengeId = await challengeWith(alex.session, postId);
    for (let i = 1; i <= 10; i++) {
      await post(
        app,
        `/challenges/${challengeId}/comments`,
        { body: `Point number ${String(i)}` },
        alex.session,
      );
    }
    const flags = await db
      .select()
      .from(reports)
      .where(
        and(eq(reports.reason, "automated"), eq(reports.targetType, "comment")),
      );
    expect(flags).toHaveLength(1);
    expect(flags[0]?.details).toContain("10 comments in 10 minutes");
  });
});
