import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { useTestEnvironment } from "./env";

export default async function setup(): Promise<void> {
  useTestEnvironment();
  const pool = new Pool({
    connectionString: process.env.MIGRATION_DATABASE_URL,
  });
  await migrate(drizzle({ client: pool }), {
    migrationsFolder: "./migrations",
  });
  await pool.end();
}
