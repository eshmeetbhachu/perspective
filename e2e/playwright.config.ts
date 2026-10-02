import { defineConfig, devices } from "@playwright/test";
import { API_PORT, BASE_URL, testDatabaseUrls, WEB_PORT } from "./env";

const databases = testDatabaseUrls();

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  // Tests share one database and the API's rate limits, so one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Separate ports from `pnpm dev`, so both can run side by side.
  webServer: [
    {
      command: "pnpm --filter @perspective/api exec tsx src/server.ts",
      url: `http://127.0.0.1:${String(API_PORT)}/health`,
      reuseExistingServer: false,
      env: {
        ...(process.env as Record<string, string>),
        NODE_ENV: "test",
        LOG_LEVEL: "warn",
        HOST: "127.0.0.1",
        PORT: String(API_PORT),
        WEB_ORIGIN: BASE_URL,
        DATABASE_URL: databases.app,
      },
    },
    {
      command: `pnpm --filter @perspective/web exec vite --port ${String(WEB_PORT)} --strictPort`,
      url: BASE_URL,
      reuseExistingServer: false,
      env: {
        ...(process.env as Record<string, string>),
        API_PROXY_TARGET: `http://127.0.0.1:${String(API_PORT)}`,
      },
    },
  ],
});
