import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    root: "./",
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // Integration spec files share one real Postgres database and each
    // resets shared tables (users, sessions, ...) in beforeEach. Running
    // files in parallel workers races those resets against each other's
    // in-flight tests (see businesses.integration.spec.ts and
    // auth.integration.spec.ts, which both touch the users table).
    fileParallelism: false,
  },
  plugins: [
    swc.vite({
      module: { type: "es6" },
    }),
  ],
});
