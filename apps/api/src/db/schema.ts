import { STANCES } from "@perspective/shared";
import { pgEnum } from "drizzle-orm/pg-core";

// The database's description of our tables, written in TypeScript.
// `pnpm db:generate` compares this file with the database's history and
// writes a migration (a .sql file) for whatever changed.

// Postgres enum: the column can only ever hold 'for', 'neutral' or 'against'.
// Built from the same STANCES list the frontend uses, so they can't disagree.
export const stanceEnum = pgEnum("stance", STANCES);
