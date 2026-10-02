// @ts-check
import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["**/dist/", "**/coverage/"]),

  // General JavaScript mistakes (unused variables, unreachable code, ...).
  eslint.configs.recommended,

  // TypeScript rules that use type information, e.g. no-floating-promises
  // (calling an async function without await, so its errors are lost).
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Find the nearest tsconfig.json for each file automatically.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Fastify plugins and handlers are written as async functions by
      // convention, even when they have nothing to await yet. Forgotten
      // awaits are still caught by no-floating-promises.
      "@typescript-eslint/require-await": "off",
    },
  },

  // Rules of Hooks for the React app (hooks only at the top level, complete
  // effect dependencies).
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
  },

  // Plain .js config files aren't part of any tsconfig, so skip type-aware rules.
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Must be last: turns off every rule that is about formatting,
  // because Prettier owns formatting.
  prettier,
);
