import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { z } from "zod";

// Applies pending migrations on deploy, as the migrator role (D19).
const url = z
  .url({ protocol: /^postgres(ql)?$/ })
  .parse(process.env.MIGRATION_DATABASE_URL);

// Any fixed number works, as long as every instance uses the same one.
const MIGRATION_LOCK = 7_212_001;

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  // If several instances start at once, the others wait here instead of
  // applying the same migration twice. Released when we disconnect.
  await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK]);
  await migrate(drizzle({ client }), { migrationsFolder: "./migrations" });
  console.log("migrations are up to date");
} finally {
  await client.end();
}
