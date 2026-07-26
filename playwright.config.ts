import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      E2E_TEST: "1",
      BETTER_AUTH_SECRET: "e2e-only-secret-at-least-thirty-two-characters",
      BETTER_AUTH_URL: "http://127.0.0.1:3100",
      ADMIN_BOOTSTRAP_TOKEN: "e2e-bootstrap-token",
      CODEFORGE_LOCAL_DB_PATH: ".data/playwright.db",
    },
  },
});
