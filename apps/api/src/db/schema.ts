import { STANCES, USER_ROLES } from "@perspective/shared";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  inet,
  pgEnum,
  pgTable,
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
