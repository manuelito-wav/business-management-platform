import nextTs from "eslint-config-next/typescript";
import nextVitals from "eslint-config-next/core-web-vitals";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import { baseConfig } from "../../eslint.config.base.mjs";

export default defineConfig([
  globalIgnores([".next/**", "next-env.d.ts"]),
  ...baseConfig,
  ...nextVitals,
  ...nextTs,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
]);
