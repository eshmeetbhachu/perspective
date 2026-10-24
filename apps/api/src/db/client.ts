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

// A read-only copy that follows the primary a few milliseconds behind. Routes
// use it only when it has replayed every write their data depends on (D71).
export const replicaPool = env.DATABASE_REPLICA_URL
  ? new Pool({ connectionString: env.DATABASE_REPLICA_URL })
  : null;
export const replicaDb = replicaPool
  ? drizzle({ client: replicaPool, schema, casing: "snake_case" })
  : null;

// Either the database or an open transaction, so helpers can join a caller's
// transaction.
export type Executor =
  typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
