import { execSync } from "node:child_process";
import pg from "pg";
import { testDatabaseUrls } from "./env";

// Brings the test database up to date and empties it, so every run starts
// from the same place.
export default async function globalSetup(): Promise<void> {
  const databases = testDatabaseUrls();
  execSync("pnpm --filter @perspective/api db:migrate", {
    stdio: "ignore",
    env: { ...process.env, MIGRATION_DATABASE_URL: databases.migrator },
  });

  const client = new pg.Client({ connectionString: databases.app });
  await client.connect();
  await client.query(
    "delete from reports; delete from questions; delete from users; delete from oauth_pending;",
  );
  await client.end();
}
