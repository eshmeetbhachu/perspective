import { existsSync } from "node:fs";

// Points the app at the perspective_test database instead of the dev one.
export function useTestEnvironment(): void {
  if (existsSync("../../.env")) {
    process.loadEnvFile("../../.env");
  }

  for (const name of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} must be set to run tests`);
    const url = new URL(value);
    url.pathname = "/perspective_test";
    process.env[name] = url.toString();
  }

  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
}
