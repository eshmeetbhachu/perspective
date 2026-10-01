import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env";
import * as schema from "./schema";

// A pool keeps a few database connections open and lends one to each query,
// instead of opening a new connection (slow) for every request.
export const pool = new Pool({ connectionString: env.DATABASE_URL });

// `db` is what the rest of the API uses to run queries.
// casing: camelCase names in TypeScript become snake_case in the database
// (createdAt -> created_at), matching the roadmap's data model.
export const db = drizzle({ client: pool, schema, casing: "snake_case" });
