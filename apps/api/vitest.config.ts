import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    // Test files share one database, so they run one at a time.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/server.ts"],
      reporter: ["text-summary", "text", "html"],
    },
  },
});
