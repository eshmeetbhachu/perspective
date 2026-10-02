import { createHash, randomBytes } from "node:crypto";
import {
  type APIResponse,
  test as base,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
} from "@playwright/test";
import pg from "pg";
import { BASE_URL, testDatabaseUrls } from "./env";

export { expect };

export interface Person {
  username: string;
  email: string;
  id: string;
  page: Page;
  // Calls the API as this person (with their session cookie).
  api: <T = unknown>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ) => Promise<T>;
}

interface PersonOptions {
  role?: "user" | "moderator" | "admin";
  verified?: boolean;
  ageDays?: number;
}

let counter = 0;
const unique = (name: string) =>
  `${name}_${Date.now().toString(36).slice(-4)}${String(counter++)}`.slice(
    0,
    20,
  );

async function json<T>(response: APIResponse): Promise<T> {
  if (!response.ok()) {
    throw new Error(
      `${String(response.status())} ${response.url()}: ${await response.text()}`,
    );
  }
  return (response.status() === 204 ? undefined : await response.json()) as T;
}

// A logged-in person in their own browser. The account and session are
// written straight to the database, so tests don't go through signup and
// login (and their rate limits) unless that is what they test.
async function createPerson(
  browser: Browser,
  db: pg.Pool,
  contexts: BrowserContext[],
  name: string,
  { role = "user", verified = true, ageDays = 30 }: PersonOptions = {},
): Promise<Person> {
  const username = unique(name);
  const email = `${username}@e2e.example`;
  const { rows } = await db.query<{ id: string }>(
    `insert into users (username, email, role, email_verified_at, created_at)
     values ($1, $2, $3, $4, now() - make_interval(days => $5))
     returning id`,
    [username, email, role, verified ? new Date() : null, ageDays],
  );
  const id = rows[0]?.id ?? "";

  const token = randomBytes(32).toString("base64url");
  await db.query(
    `insert into sessions (user_id, token_hash, expires_at)
     values ($1, $2, now() + interval '1 day')`,
    [id, createHash("sha256").update(token).digest("hex")],
  );

  const context = await browser.newContext({ baseURL: BASE_URL });
  contexts.push(context);
  await context.addCookies([
    { name: "session", value: token, url: BASE_URL, httpOnly: true },
  ]);
  const page = await context.newPage();

  const api: Person["api"] = async (method, path, body) =>
    json(
      await context.request.fetch(`/api${path}`, {
        method,
        data: body,
        headers: { origin: BASE_URL },
      }),
    );

  return { username, email, id, page, api };
}

export const test = base.extend<
  { person: (name: string, options?: PersonOptions) => Promise<Person> },
  { db: pg.Pool }
>({
  db: [
    // Playwright reads fixture dependencies from this destructuring pattern,
    // so it must be present even when empty.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const pool = new pg.Pool({ connectionString: testDatabaseUrls().app });
      await use(pool);
      await pool.end();
    },
    { scope: "worker" },
  ],
  person: async ({ browser, db }, use) => {
    const contexts: BrowserContext[] = [];
    await use((name, options) =>
      createPerson(browser, db, contexts, name, options),
    );
    for (const context of contexts) await context.close();
  },
});

// A published question with one post, by a fresh author.
export async function questionWithPost(
  author: Person,
  stance: "for" | "neutral" | "against" = "for",
) {
  const tag = Date.now().toString(36);
  const { question } = await author.api<{ question: { slug: string } }>(
    "POST",
    "/questions",
    { title: `Should cities ban cars downtown ${tag}?` },
  );
  await author.api("PUT", `/questions/${question.slug}/stance`, { stance });
  const { post } = await author.api<{ post: { id: string } }>(
    "POST",
    `/questions/${question.slug}/posts`,
    {
      title: "Streets are for people",
      body: "Car-free centres cut pollution and make walking safe for children.",
    },
  );
  return { slug: question.slug, postId: post.id };
}
