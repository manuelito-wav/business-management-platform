import nextTs from "eslint-config-next/typescript";
import nextVitals from "eslint-config-next/core-web-vitals";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import { baseConfig } from "./eslint.config.base.mjs";

/**
 * Whole-repo entry point, used by `pnpm lint` at the root and by
 * lint-staged (which invokes eslint from the repo root regardless of
 * where the staged file lives). Each app/package also carries its own
 * eslint.config.mjs importing the same eslint.config.base.mjs, so
 * `turbo run lint` can still cache/parallelize per package.
 */
export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/coverage/**",
    "**/generated/prisma/**",
    "**/next-env.d.ts",
  ]),
  ...baseConfig,
  {
    files: ["apps/api/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
  {
    files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
    extends: [nextVitals, nextTs],
    languageOptions: {
      globals: { ...globals.browser },
    },
    settings: {
      next: {
        rootDir: "apps/web/",
      },
    },
  },
]);
