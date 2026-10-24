// Usage:
//   pnpm seed                       50 users, 30 questions (default)
//   pnpm seed --users 500 --questions 200
//   pnpm seed --clear               remove everything the seed created
//
// Seeded accounts all have emails ending in @seed.example and the password
// "seed-password-123", so they can be cleared without touching real data.
import { randomInt } from "node:crypto";
import { parseArgs } from "node:util";
import type { Stance } from "@perspective/shared";
import { inArray, like, sql } from "drizzle-orm";
import { env } from "../src/config/env";
import { db, pool } from "../src/db/client";
import {
  challenges,
  comments,
  posts,
  postVotes,
  questions,
  stanceHistory,
  userStances,
  users,
} from "../src/db/schema";
import { hashPassword } from "../src/modules/auth/passwords";
import { slugify } from "../src/modules/questions/slugs";
import { recomputeScores } from "../src/modules/votes/scores";
import { voteWeight } from "../src/modules/votes/weights";

const SEED_DOMAIN = "seed.example";
const DAY_MS = 24 * 60 * 60 * 1000;

const { values: args } = parseArgs({
  options: {
    users: { type: "string", default: "50" },
    questions: { type: "string", default: "30" },
    clear: { type: "boolean", default: false },
  },
});

if (env.NODE_ENV === "production") {
  console.error("Refusing to seed a production database");
  process.exit(1);
}

// --- Random helpers -------------------------------------------------------

const pick = <T>(items: readonly T[]): T => {
  const item = items[randomInt(items.length)];
  if (item === undefined) throw new Error("pick() from an empty list");
  return item;
};
const chance = (probability: number) => Math.random() < probability;
const between = (start: Date, end: Date) =>
  new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));

// UUIDv7 for a given moment, so a seeded row's id matches its backdated
// created_at and "Newest" sorting agrees with the dates shown.
function uuidv7At(date: Date): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let ms = date.getTime();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms & 0xff;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// --- Content ------------------------------------------------------------

const NAMES = [
  "ava",
  "ben",
  "chen",
  "dara",
  "eli",
  "farah",
  "gus",
  "hana",
  "ivan",
  "jo",
  "kiran",
  "lena",
  "milo",
  "nadia",
  "omar",
  "priya",
  "quinn",
  "rosa",
  "sam",
  "tariq",
  "uma",
  "vik",
  "wen",
  "xavi",
  "yara",
  "zane",
  "arjun",
  "bea",
  "cleo",
  "dev",
  "esme",
  "finn",
  "gia",
  "hugo",
  "isla",
  "jai",
  "kofi",
  "lia",
];

const QUESTIONS = [
  "Should voting be mandatory?",
  "Should cities ban cars from their centres?",
  "Should social media be banned for under-16s?",
  "Is remote work better than working in an office?",
  "Should university education be free?",
  "Should the voting age be lowered to 16?",
  "Is nuclear power the best way to cut emissions?",
  "Should homework be abolished in primary schools?",
  "Should billionaires pay a wealth tax?",
  "Is a four-day working week a good idea?",
  "Should zoos be phased out?",
  "Should plastic packaging be banned?",
  "Should countries adopt a universal basic income?",
  "Is it right to genetically edit human embryos?",
  "Should recreational cannabis be legal?",
  "Should school uniforms be required?",
  "Should public transport be free?",
  "Is space exploration worth the cost?",
  "Should tipping be replaced by higher wages?",
  "Should AI-generated art be eligible for awards?",
  "Should meat be taxed like tobacco?",
  "Should national service be compulsory?",
  "Is it fair to ban phones in classrooms?",
  "Should the death penalty be abolished everywhere?",
  "Should rich countries open their borders to climate refugees?",
  "Should children learn coding before a second language?",
  "Should professional athletes be allowed to use enhancements?",
  "Should tech companies be broken up?",
  "Should standardized tests be dropped from admissions?",
  "Should daylight saving time be ended?",
];

const SUBJECTS = [
  "cities",
  "schools",
  "governments",
  "employers",
  "hospitals",
  "universities",
  "landlords",
  "farmers",
];
const ACTIONS = [
  "be required to publish",
  "be banned from using",
  "be paid to adopt",
  "be taxed for",
  "be free to refuse",
];
const OBJECTS = [
  "salary data",
  "facial recognition",
  "renewable energy",
  "four-day weeks",
  "AI tutors",
  "plastic packaging",
  "open-source software",
];
const PLACES = [
  "in big cities",
  "in rural areas",
  "in public schools",
  "in universities",
  "in hospitals",
  "in small businesses",
  "in local councils",
  "in developing countries",
  "across Europe",
  "in India",
  "in the United States",
  "in South America",
  "in Africa",
  "in Southeast Asia",
  "in coastal towns",
  "on social media",
  "in sports",
  "in the military",
  "in prisons",
  "in public transport",
  "in national parks",
  "in tech companies",
  "in newsrooms",
  "in elections",
  "for teenagers",
];
const TIMEFRAMES = [
  "by 2030",
  "within five years",
  "next year",
  "permanently",
  "as a trial",
  "during emergencies",
  "on weekends",
  "for everyone",
  "right now",
  "within a decade",
];

const POST_TITLES: Record<Stance, string[]> = {
  for: [
    "The benefits clearly outweigh the costs",
    "It protects the people with least say",
    "We've seen it work elsewhere",
    "Doing nothing is the bigger risk",
    "It's fairer in the long run",
  ],
  neutral: [
    "It depends on how it's done",
    "Both sides miss the real question",
    "The evidence is genuinely mixed",
    "Try it small before going big",
    "What we'd need to know first",
  ],
  against: [
    "The costs land on the wrong people",
    "There are better ways to get there",
    "It sounds good but won't work",
    "It takes away a real choice",
    "The unintended effects are too large",
  ],
};

const SENTENCES = [
  "The strongest evidence comes from places that have already tried something similar.",
  "Most of the costs fall on people who have the least room to absorb them.",
  "It's easy to underestimate how quickly people adapt once the rules change.",
  "The short-term disruption matters, but it shouldn't decide the long-term question.",
  "We should be honest that the data here is thinner than either side admits.",
  "A gradual rollout would let us learn without betting everything at once.",
  "The people most affected are rarely the ones in the room when this is decided.",
  "Enforcement is the part that usually goes wrong, not the principle.",
  "If the goal is fairness, we need to look at who pays and who benefits.",
  "There's a real trade-off between freedom and protection here.",
  "History suggests the first version of any policy like this gets revised.",
  "Small details in the design will matter more than the headline.",
  "I changed my mind on this after looking at how it played out in practice.",
  "The loudest arguments on both sides tend to ignore the middle ground.",
];

const COMMENTS = [
  "Do you have a source for that?",
  "That's fair, but it doesn't address the cost question.",
  "I hadn't thought about it that way.",
  "This assumes the rollout goes smoothly, which it rarely does.",
  "Agreed on the principle, not on the timeline.",
  "What would change your mind here?",
  "The example you give is from a very different context.",
  "Good point, though I'd weigh it differently.",
  "Isn't that the same argument the other side makes?",
  "Here's where I think we actually disagree.",
];

const paragraph = (min: number, max: number) =>
  Array.from({ length: min + randomInt(max - min + 1) }, () =>
    pick(SENTENCES),
  ).join(" ");

const STANCE_WEIGHTS: [Stance, number][] = [
  ["for", 0.4],
  ["neutral", 0.25],
  ["against", 0.35],
];
function randomStance(): Stance {
  let roll = Math.random();
  for (const [stance, weight] of STANCE_WEIGHTS) {
    if ((roll -= weight) < 0) return stance;
  }
  return "against";
}

// --- Clear ----------------------------------------------------------------

async function clear() {
  const seeded = db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, `%@${SEED_DOMAIN}`));
  // Questions take their posts, challenges, comments and votes with them.
  const removedQuestions = await db
    .delete(questions)
    .where(inArray(questions.createdBy, seeded))
    .returning({ id: questions.id });
  const removedUsers = await db
    .delete(users)
    .where(like(users.email, `%@${SEED_DOMAIN}`))
    .returning({ id: users.id });
  console.log(
    `Removed ${String(removedUsers.length)} seeded users and ${String(removedQuestions.length)} seeded questions`,
  );
}

// --- Seed -----------------------------------------------------------------

// How many users take a stance on a question. Real sites are lopsided: most
// questions get a handful of people, a few get thousands (a Pareto tail).
const participantCount = (userCount: number) =>
  Math.min(userCount, 3000, Math.floor(6 / Math.random() ** (1 / 1.3)));

// k distinct items without copying a large array.
function sample<T>(items: readonly T[], k: number): T[] {
  if (k * 2 >= items.length) {
    return [...items].sort(() => Math.random() - 0.5).slice(0, k);
  }
  const picked = new Set<T>();
  while (picked.size < k) picked.add(pick(items));
  return [...picked];
}

interface SeedUser {
  id: string;
  createdAt: Date;
}
type SeedQuestion = typeof questions.$inferInsert & {
  id: string;
  createdAt: Date;
};
type SeedPost = typeof posts.$inferInsert & { id: string; createdAt: Date };
type SeedComment = typeof comments.$inferInsert & {
  id: string;
  createdAt: Date;
  depth: number;
};

const totals = new Map<string, number>();

async function insertCounted<T extends Record<string, unknown>>(
  label: string,
  rows: T[],
  insert: (batch: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < rows.length; i += 1000) {
    await insert(rows.slice(i, i + 1000));
  }
  totals.set(label, (totals.get(label) ?? 0) + rows.length);
}

// Generates and inserts everything that hangs off one chunk of questions,
// so memory stays flat however many questions are seeded.
async function seedQuestionChunk(
  userRows: SeedUser[],
  chunk: SeedQuestion[],
  now: Date,
) {
  const stanceRows: (typeof userStances.$inferInsert)[] = [];
  const postRows: SeedPost[] = [];
  const voteRows: (typeof postVotes.$inferInsert)[] = [];
  const challengeRows: (typeof challenges.$inferInsert)[] = [];
  const commentRows: SeedComment[] = [];

  for (const question of chunk) {
    const participants = sample(userRows, participantCount(userRows.length));
    const stances = new Map<string, Stance>();
    for (const user of participants) {
      const stance = randomStance();
      stances.set(user.id, stance);
      stanceRows.push({
        userId: user.id,
        questionId: question.id,
        stance,
        updatedAt: question.createdAt,
      });
    }

    const questionPosts: SeedPost[] = [];
    for (const user of participants) {
      const stance = stances.get(user.id);
      if (!stance || !chance(0.25)) continue;
      const createdAt = between(question.createdAt, now);
      const post = {
        id: uuidv7At(createdAt),
        questionId: question.id,
        authorId: user.id,
        stance,
        title: pick(POST_TITLES[stance]),
        body: paragraph(2, 7),
        createdAt,
      };
      questionPosts.push(post);
      postRows.push(post);
    }

    // Each participant marks a few posts as helpful (0-3, never their own).
    for (const user of participants) {
      const voterStance = stances.get(user.id);
      if (!voterStance) continue;
      const others = questionPosts.filter((p) => p.authorId !== user.id);
      for (const post of sample(
        others,
        Math.min(others.length, randomInt(4)),
      )) {
        voteRows.push({
          userId: user.id,
          postId: post.id,
          voterStance,
          weight: voteWeight(voterStance, post.stance),
          createdAt: between(post.createdAt, now),
        });
      }
    }

    for (const post of questionPosts) {
      if (!chance(0.1)) continue;
      const challengers = participants.filter(
        (u) => u.id !== post.authorId && stances.get(u.id) !== post.stance,
      );
      for (const challenger of sample(
        challengers,
        Math.min(challengers.length, 1 + randomInt(3)),
      )) {
        const createdAt = between(post.createdAt, now);
        const challenge = {
          id: uuidv7At(createdAt),
          postId: post.id,
          createdBy: challenger.id,
          title: `What about the ${pick(["costs", "evidence", "people left out", "timeline", "alternatives"])}?`,
          body: paragraph(2, 4),
          createdAt,
        };
        challengeRows.push(challenge);

        const thread: SeedComment[] = [];
        const speakers = [
          post.authorId,
          challenger.id,
          ...participants.slice(0, 5).map((u) => u.id),
        ];
        for (let n = 0; n < randomInt(9); n++) {
          const parent =
            thread.length > 0 && chance(0.7) ? pick(thread) : undefined;
          const commentAt = between(
            parent?.createdAt ?? challenge.createdAt,
            now,
          );
          const comment = {
            id: uuidv7At(commentAt),
            challengeId: challenge.id,
            parentId: parent?.id ?? null,
            authorId: pick(speakers),
            body: pick(COMMENTS),
            depth: parent ? parent.depth + 1 : 1,
            createdAt: commentAt,
          };
          thread.push(comment);
          commentRows.push(comment);
        }
      }
    }
  }

  await insertCounted("stances", stanceRows, async (batch) => {
    await db.insert(userStances).values(batch);
    await db.insert(stanceHistory).values(
      batch.map((s) => ({
        userId: s.userId,
        questionId: s.questionId,
        toStance: s.stance,
        changedAt: s.updatedAt,
      })),
    );
  });
  await insertCounted("posts", postRows, (batch) =>
    db.insert(posts).values(batch),
  );
  await insertCounted("votes", voteRows, (batch) =>
    db.insert(postVotes).values(batch),
  );
  await insertCounted("challenges", challengeRows, (batch) =>
    db.insert(challenges).values(batch),
  );
  // Parents before children: sorted by time, a reply always follows its parent.
  commentRows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  await insertCounted("comments", commentRows, (batch) =>
    db.insert(comments).values(batch),
  );
}

async function seed(userCount: number, questionCount: number) {
  const started = Date.now();
  const now = new Date();
  const since = new Date(now.getTime() - 90 * DAY_MS);
  const passwordHash = await hashPassword("seed-password-123");
  const run = Date.now().toString(36).slice(-4);
  console.log(
    `Seeding ${String(userCount)} users and ${String(questionCount)} questions…`,
  );

  const userRows = Array.from({ length: userCount }, (_, i) => {
    const createdAt = between(since, new Date(now.getTime() - 2 * DAY_MS));
    const username = `${pick(NAMES).slice(0, 8)}_${run}${String(i)}`;
    return {
      id: uuidv7At(createdAt),
      username,
      email: `${username}@${SEED_DOMAIN}`,
      passwordHash,
      emailVerifiedAt: createdAt,
      createdAt,
    };
  });
  await insertCounted("users", userRows, (batch) =>
    db.insert(users).values(batch),
  );

  const takenSlugs = new Set(
    (await db.select({ slug: questions.slug }).from(questions)).map(
      (q) => q.slug,
    ),
  );
  const CHUNK = 500;
  for (let start = 0; start < questionCount; start += CHUNK) {
    const chunk = Array.from(
      { length: Math.min(CHUNK, questionCount - start) },
      (_, j): SeedQuestion => {
        const title =
          QUESTIONS[start + j] ??
          `Should ${pick(SUBJECTS)} ${pick(ACTIONS)} ${pick(OBJECTS)} ${pick(PLACES)} ${pick(TIMEFRAMES)}?`;
        const base = slugify(title);
        let slug = base;
        for (let n = 2; takenSlugs.has(slug); n++)
          slug = `${base}-${String(n)}`;
        takenSlugs.add(slug);
        const author = pick(userRows);
        const createdAt = between(author.createdAt, now);
        return {
          id: uuidv7At(createdAt),
          title,
          slug,
          description: chance(0.6) ? paragraph(1, 3) : "",
          createdBy: author.id,
          createdAt,
        };
      },
    );
    await insertCounted("questions", chunk, (batch) =>
      db.insert(questions).values(batch),
    );
    await seedQuestionChunk(userRows, chunk, now);
    if (questionCount > CHUNK) {
      console.log(
        `  ${String(Math.min(start + CHUNK, questionCount))}/${String(questionCount)} questions`,
      );
    }
  }

  for (const [label, count] of totals) {
    console.log(`  ${String(count).padStart(9)} ${label}`);
  }

  await recomputeScores();
  const [scored] = await db
    .select({
      count: sql<number>`count(*) filter (where helpful_score > 0)::int`,
    })
    .from(posts);
  console.log(
    `Done in ${((Date.now() - started) / 1000).toFixed(1)}s. ${String(scored?.count ?? 0)} posts have helpful votes.`,
  );
  console.log(
    `Log in as any seeded user with password "seed-password-123", e.g. ${userRows[0]?.email ?? ""}`,
  );
}

try {
  if (args.clear) {
    await clear();
  } else {
    await seed(Number(args.users), Number(args.questions));
  }
} finally {
  await pool.end();
}
