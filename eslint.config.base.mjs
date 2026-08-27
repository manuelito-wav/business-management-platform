import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import tseslint from "typescript-eslint";

/**
 * Shared lint rules for every package in the monorepo. Each app/package
 * has its own eslint.config.mjs that imports this array (ESLint's flat
 * config does not climb directories in a pnpm workspace the way tsconfig
 * "extends" does, so every lintable directory needs its own config file).
 */
export const baseConfig = [js.configs.recommended, ...tseslint.configs.recommended, prettier];
