// Runs a command against the perspective_load database instead of the dev one
// (Phase 9), e.g. `pnpm load:seed` from the repository root.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync("../../.env")) process.loadEnvFile("../../.env");

for (const name of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[name] ?? "");
  url.pathname = "/perspective_load";
  process.env[name] = url.toString();
}

const [command = "", ...args] = process.argv.slice(2);
const result = spawnSync(command, args, { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
