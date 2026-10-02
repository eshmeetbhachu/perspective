import { STANCES, USER_ROLES } from "@perspective/shared";
import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  inet,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// The database's description of our tables, written in TypeScript.
// `pnpm db:generate` compares this file with the database's history and
// writes a migration (a .sql file) for whatever changed.
// Column names are camelCase here and snake_case in the database
// (passwordHash -> password_hash), because of `casing: "snake_case"`.

// Postgres enum: the column can only ever hold 'for', 'neutral' or 'against'.
// Built from the same STANCES list the frontend uses, so they can't disagree.
export const stanceEnum = pgEnum("stance", STANCES);

export const userRoleEnum = pgEnum("user_role", USER_ROLES);

// Every id is a UUIDv7 created by Postgres itself (D26).
const id = () =>
  uuid()
    .primaryKey()
    .default(sql`uuidv7()`);

// Timestamps always store the time zone, so "when" is never ambiguous.
const timestamptz = () => timestamp({ withTimezone: true });

export const users = pgTable(
  "users",
  {
    id: id(),
    username: text().notNull(),
    email: text().notNull(),
    // Empty for accounts that only sign in with Google (D24).
    passwordHash: text(),
    role: userRoleEnum().notNull().default("user"),
    emailVerifiedAt: timestamptz(),
    bannedAt: timestamptz(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    // Unique ignoring capitals (D28): the index stores lower(email), so
    // "Sam@Mail.com" collides with an existing "sam@mail.com".
    uniqueIndex("users_email_lower_unique").on(sql`lower(${t.email})`),
    uniqueIndex("users_username_lower_unique").on(sql`lower(${t.username})`),
    // The database refuses bad usernames even if the API has a bug.
    check("users_username_format", sql`${t.username} ~ '^[A-Za-z0-9_]{3,20}$'`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    // Used to refer to a session (e.g. "log out this device") without
    // exposing the secret token.
    id: id(),
    // Foreign key: every session belongs to an existing user. Deleting the
    // user deletes their sessions too (cascade).
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // SHA-256 of the token in the cookie. The token itself is never stored,
    // so a leaked database can't be used to log in as anyone.
    tokenHash: text().notNull(),
    expiresAt: timestamptz().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    ip: inet(),
    userAgent: text(),
  },
  (t) => [
    // Every request looks up its session by token hash: must be fast.
    uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
    // "Log out everywhere" and cascade deletes find a user's sessions.
    index("sessions_user_id_idx").on(t.userId),
  ],
);

export const oauthProviderEnum = pgEnum("oauth_provider", ["google"]);

// A Google account attached to a user. Matched by Google's stable user id
// (`sub`), never by email (D27).
export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    provider: oauthProviderEnum().notNull(),
    providerUserId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerUserId] }),
    uniqueIndex("oauth_accounts_user_provider_unique").on(t.userId, t.provider),
  ],
);

// A verified Google identity waiting for the next step: picking a username
// (new account) or logging in to the existing account it should join.
export const oauthPending = pgTable(
  "oauth_pending",
  {
    id: id(),
    tokenHash: text().notNull(),
    provider: oauthProviderEnum().notNull(),
    providerUserId: text().notNull(),
    email: text().notNull(),
    expiresAt: timestamptz().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [uniqueIndex("oauth_pending_token_hash_unique").on(t.tokenHash)],
);

export const emailTokenPurposeEnum = pgEnum("email_token_purpose", [
  "verify_email",
  "reset_password",
]);

// Links sent by email. A token is used up by deleting its row.
export const emailTokens = pgTable(
  "email_tokens",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: emailTokenPurposeEnum().notNull(),
    tokenHash: text().notNull(),
    expiresAt: timestamptz().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_tokens_token_hash_unique").on(t.tokenHash),
    index("email_tokens_user_id_idx").on(t.userId),
  ],
);

export const questionStatusEnum = pgEnum("question_status", [
  "pending",
  "published",
  "removed",
]);

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

export const questions = pgTable(
  "questions",
  {
    id: id(),
    title: text().notNull(),
    slug: text().notNull(),
    description: text().notNull().default(""),
    // Questions outlive their author's account.
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    status: questionStatusEnum().notNull().default("published"),
    // Kept up to date by Postgres itself; title words weigh more than
    // description words when ranking search results.
    searchVector: tsvector().generatedAlwaysAs(
      sql`setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', description), 'B')`,
    ),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("questions_slug_unique").on(t.slug),
    // Newest-first listing: UUIDv7 ids are in creation order.
    index("questions_status_id_idx").on(t.status, t.id.desc()),
    index("questions_created_by_idx").on(t.createdBy, t.createdAt),
    index("questions_search_idx").using("gin", t.searchVector),
    index("questions_title_trgm_idx").using("gin", t.title.op("gin_trgm_ops")),
    check(
      "questions_title_length",
      sql`char_length(${t.title}) between 10 and 150`,
    ),
    check(
      "questions_description_length",
      sql`char_length(${t.description}) <= 2000`,
    ),
  ],
);

// A reader's current stance on a question: one per person per question (D5).
export const userStances = pgTable(
  "user_stances",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    stance: stanceEnum().notNull(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.questionId] }),
    index("user_stances_question_idx").on(t.questionId, t.stance),
  ],
);

// Every declaration and change, for "changed my mind" insights later (D8).
export const stanceHistory = pgTable(
  "stance_history",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    fromStance: stanceEnum(),
    toStance: stanceEnum().notNull(),
    changedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [index("stance_history_user_question_idx").on(t.userId, t.questionId)],
);

export const posts = pgTable(
  "posts",
  {
    id: id(),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    // Posts outlive their author's account, like questions.
    authorId: uuid().references(() => users.id, { onDelete: "set null" }),
    stance: stanceEnum().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    // Precomputed on every vote, in the same transaction, so listings never
    // recount votes (Phase 4).
    helpfulScore: integer().notNull().default(0),
    helpfulCount: integer().notNull().default(0),
    crossSideCount: integer().notNull().default(0),
    createdAt: timestamptz().notNull().defaultNow(),
    editedAt: timestamptz(),
    deletedAt: timestamptz(),
  },
  (t) => [
    // One column of one question, newest first, live posts only.
    index("posts_column_idx")
      .on(t.questionId, t.stance, t.id.desc())
      .where(sql`${t.deletedAt} is null`),
    // One live post per person per side of a question.
    uniqueIndex("posts_author_question_stance_unique")
      .on(t.authorId, t.questionId, t.stance)
      .where(sql`${t.deletedAt} is null`),
    // "Top" sort within one column.
    index("posts_column_top_idx")
      .on(t.questionId, t.stance, t.helpfulScore.desc(), t.id.desc())
      .where(sql`${t.deletedAt} is null`),
    index("posts_author_created_idx").on(t.authorId, t.createdAt),
    check("posts_title_length", sql`char_length(${t.title}) between 5 and 120`),
    check(
      "posts_body_length",
      sql`char_length(${t.body}) between 30 and 10000`,
    ),
  ],
);

// One "this helped me understand" per person per post. The voter's stance and
// the weight it earned are frozen at vote time (D7, D44).
export const postVotes = pgTable(
  "post_votes",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    voterStance: stanceEnum().notNull(),
    weight: integer().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.postId] }),
    index("post_votes_post_idx").on(t.postId),
  ],
);
