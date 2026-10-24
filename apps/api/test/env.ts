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

  // Redis database 1, so tests never share cache entries with development.
  // An empty REDIS_URL= in .env counts as unset.
  const configured = process.env.REDIS_URL;
  const redisUrl = new URL(
    configured !== undefined && configured !== ""
      ? configured
      : "redis://127.0.0.1:6379",
  );
  redisUrl.pathname = "/1";
  process.env.REDIS_URL = redisUrl.toString();

  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
}
