import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against their own Stalwart (port 28080, fresh data, seeded) and their own Vite
 * (port 5174), so a running dev setup is not touched.
 */
const STALWART_PORT = 28080;
const APP_PORT = 5174;

const launchOptions = process.env.PW_CHROMIUM_PATH
  ? { executablePath: process.env.PW_CHROMIUM_PATH }
  : {};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions,
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions },
      grepInvert: /@phone/,
    },
    { name: "phone", use: { ...devices["Pixel 7"], launchOptions }, grep: /@phone/ },
  ],
  webServer: [
    {
      command: `bun dev/stalwart.ts --instance e2e --http ${STALWART_PORT} --smtp 20025 --imap 20143 --fresh --seed`,
      wait: { stdout: /Testdaten bereit/ },
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: "pipe",
    },
    {
      command: `bunx vite --port ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}`,
      env: { STALWART_URL: `http://127.0.0.1:${STALWART_PORT}`, PORT: String(APP_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
