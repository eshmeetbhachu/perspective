// @ts-check
import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier";
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
