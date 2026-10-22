import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    passWithNoTests: true,
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "e2e/**"],
    // src/lib/db.ts throws at import time without DATABASE_URL, which silently
    // stops every test file that imports it from loading. Unit tests mock the
    // database, so give them an unreachable placeholder: they load without a
    // .env, and can never reach a real database by accident.
    env: {
      DATABASE_URL: "postgres://placeholder:placeholder@127.0.0.1:1/placeholder",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
