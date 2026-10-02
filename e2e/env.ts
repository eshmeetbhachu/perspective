import { existsSync } from "node:fs";

export const API_PORT = 3100;
export const WEB_PORT = 5174;
export const BASE_URL = `http://localhost:${String(WEB_PORT)}`;

// The end-to-end run uses the perspective_test database, like the API tests,
// so it never touches development data. Don't run both suites at once.
export function testDatabaseUrls() {
  if (existsSync("../.env")) process.loadEnvFile("../.env");
  const toTest = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} must be set to run end-to-end tests`);
    const url = new URL(value);
    url.pathname = "/perspective_test";
    return url.toString();
  };
  return {
    app: toTest("DATABASE_URL"),
    migrator: toTest("MIGRATION_DATABASE_URL"),
  };
}
