import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "dot",
  use: {
    baseURL: "http://localhost:3967",
    trace: "on-first-retry",
  },
  projects: [{ name: "firefox", use: { ...devices["Desktop Firefox"] } }],
  webServer: {
    command: "npx serve . -l 3967",
    url: "http://localhost:3967",
    reuseExistingServer: !process.env.CI,
  },
});
