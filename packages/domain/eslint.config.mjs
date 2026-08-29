import { defineConfig, globalIgnores } from "eslint/config";
import { baseConfig } from "../../eslint.config.base.mjs";

export default defineConfig([globalIgnores(["dist/**"]), ...baseConfig]);
