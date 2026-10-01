import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";
import { z } from "zod";

// Settings for drizzle-kit, the command-line tool that generates and runs
// migrations. It is separate from the API server and uses its own,
// more powerful database role (D19).

// Locally, read the root .env. In CI/production the variables are set by
// the platform, so there is no file.
if (existsSync("../../.env")) {
  process.loadEnvFile("../../.env");
}

const MIGRATION_DATABASE_URL = z
  .url({ protocol: /^postgres(ql)?$/ })
  .parse(process.env.MIGRATION_DATABASE_URL);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./migrations",
  casing: "snake_case",
  dbCredentials: { url: MIGRATION_DATABASE_URL },
  // Fail on anything ambiguous instead of guessing (e.g. rename vs drop).
  strict: true,
  verbose: true,
});
