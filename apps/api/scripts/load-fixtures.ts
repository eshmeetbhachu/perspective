// Writes load/data/fixtures.json for the k6 load tests: question slugs from
// most to least popular, posts and challenges to open, and sessions for
// seeded users. Run through load/with-load-db.mjs; refuses any other database.
import { mkdirSync, writeFileSync } from "node:fs";
import { env } from "../src/config/env";
import { pool } from "../src/db/client";
import { hashToken, newToken } from "../src/modules/auth/tokens";

const SESSIONS = 2000;

if (new URL(env.DATABASE_URL).pathname !== "/perspective_load") {
  console.error("Refusing: fixtures create sessions, so only perspective_load");
  process.exit(1);
}

const rows = async <T>(sql: string, params: unknown[] = []) =>
  (await pool.query<T & Record<string, unknown>>(sql, params)).rows;

try {
  const slugs = await rows<{ slug: string }>(`
    select q.slug from questions q
    left join user_stances s on s.question_id = q.id
    where q.status = 'published'
    group by q.id order by count(s.*) desc`);
  const postIds = await rows<{ id: string }>(
    `select id from posts where deleted_at is null and removed_at is null order by random() limit 20000`,
  );
  const challengeIds = await rows<{ id: string }>(
    `select id from challenges order by random() limit 5000`,
  );

  const users = await rows<{ id: string }>(
    `select id from users where email like '%@seed.example' order by random() limit $1`,
    [SESSIONS],
  );
  const sessions: { token: string; votable: string[] }[] = [];
  for (const user of users) {
    const token = newToken();
    await pool.query(
      `insert into sessions (user_id, token_hash, expires_at)
       values ($1, $2, now() + interval '30 days')`,
      [user.id, hashToken(token)],
    );
    // Posts this user may vote on: they hold a stance there, and it isn't theirs.
    const votable = await rows<{ id: string }>(
      `select p.id from posts p
       join user_stances s on s.question_id = p.question_id and s.user_id = $1
       where p.author_id <> $1 and p.deleted_at is null and p.removed_at is null limit 10`,
      [user.id],
    );
    sessions.push({ token, votable: votable.map((p) => p.id) });
  }

  mkdirSync("../../load/data", { recursive: true });
  writeFileSync(
    "../../load/data/fixtures.json",
    JSON.stringify({
      slugs: slugs.map((q) => q.slug),
      postIds: postIds.map((p) => p.id),
      challengeIds: challengeIds.map((c) => c.id),
      sessions,
    }),
  );
  console.log(
    `Wrote ${String(slugs.length)} questions, ${String(postIds.length)} posts, ${String(challengeIds.length)} challenges, ${String(sessions.length)} sessions`,
  );
} finally {
  await pool.end();
}
