import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "tests/rendered-html.test.mjs",
      "**/node_modules/**",
      "**/dist/**",
      "**/.worktrees/**",
    ],
  },
});
