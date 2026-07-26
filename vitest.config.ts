import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 单测统一走隔离库，绝不触碰开发库 .data/codenow.db（保护本地测试点与提交记录）
    env: { CODEFORGE_LOCAL_DB_PATH: resolve(process.cwd(), ".data", "vitest-local.db") },
    globalSetup: ["./tests/vitest-global-setup.ts"],
    exclude: [
      "tests/rendered-html.test.mjs",
      "**/node_modules/**",
      "**/dist/**",
      "**/.worktrees/**",
    ],
  },
});
