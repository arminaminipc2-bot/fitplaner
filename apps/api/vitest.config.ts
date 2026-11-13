import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // A separate file per test run: the suite writes real rows.
    env: { NODE_ENV: "test", DATABASE_URL: "file:./test.db" },
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
  },
});
