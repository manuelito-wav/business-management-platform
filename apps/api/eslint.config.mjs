import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import { baseConfig } from "../../eslint.config.base.mjs";

export default defineConfig([
  globalIgnores(["dist/**", "src/generated/**"]),
  ...baseConfig,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // NestJS providers/modules are legitimately decorator-only classes
      // with no instance members.
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
]);
