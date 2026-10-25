import { defineConfig, devices } from "@playwright/test";
import { SCHREIBZEUG_DEV_SECRET } from "./dev/config";

/**
 * E2E tests run against their own Stalwart (port 28080, fresh data, seeded), their own Kontext
 * server (28090) and their own Vite (5174), so a running dev setup is not touched.
 */
const STALWART_PORT = 28080;
const SERVER_PORT = 28090;
const APP_PORT = 5174;
const GRAPH_PORT = 28095;
const LIVEKIT_PORT = 27880;
const SCHREIBZEUG_PORT = 28097;

const launchOptions = {
  ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
  // Calls: a test pattern as camera and a tone as microphone, without asking.
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
};

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
      grepInvert: /@phone|@screenshots/,
      testIgnore: /pwa\.spec\.ts/,
    },
    {
      name: "phone",
      use: { ...devices["Pixel 7"], launchOptions },
      grep: /@phone/,
      testIgnore: /pwa\.spec\.ts/,
    },
    // The built app as in production (service worker, manifest, caching), served by the server.
    {
      name: "pwa",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${SERVER_PORT}`,
        launchOptions,
      },
      testMatch: /pwa\.spec\.ts/,
    },
    // Pictures for the README and the docs: `bun run screenshots` (or the workflow).
    {
      name: "screenshots",
      use: { ...devices["Desktop Chrome"], launchOptions },
      grep: /@screenshots/,
    },
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
      command: `bun dev/livekit.ts --port ${LIVEKIT_PORT} --server ${SERVER_PORT}`,
      wait: { stdout: /LiveKit .* bereit/ },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: `bun dev/fake-graph.ts --port ${GRAPH_PORT}`,
      url: `http://127.0.0.1:${GRAPH_PORT}/`,
      reuseExistingServer: false,
    },
    {
      // Documents: a stand-in for Schreibzeug that signs in through Kontext (dev/fake-schreibzeug.ts).
      command: `bun dev/fake-schreibzeug.ts --port ${SCHREIBZEUG_PORT} --kontext http://localhost:${APP_PORT}`,
      url: `http://localhost:${SCHREIBZEUG_PORT}/api/health`,
      reuseExistingServer: false,
    },
    {
      command: "rm -rf .dev/e2e-server && bun server/main.ts",
      url: `http://127.0.0.1:${SERVER_PORT}/healthz`,
      env: {
        PORT: String(SERVER_PORT),
        STALWART_URL: `http://127.0.0.1:${STALWART_PORT}`,
        BETTER_AUTH_URL: `http://localhost:${APP_PORT}`,
        DATABASE_PATH: ".dev/e2e-server/kontext.db",
        // The built app (`bun run e2e` builds it first) for the pwa project.
        STATIC_DIR: "dist",
        SIGN_IN_PER_MINUTE: "1000",
        // The move tests use the local Stalwart's IMAP (no TLS) as the "old provider".
        MAIL_SYNC_ALLOW_PLAIN: "true",
        PUSH_ANY_ENDPOINT: "true",
        LIVEKIT_URL: `http://127.0.0.1:${LIVEKIT_PORT}`,
        SNOOZE_TICK_MS: "1000",
        REMINDER_TICK_MS: "1000",
        RULE_TASK_TICK_MS: "1000",
        UNSUBSCRIBE_ANY_TARGET: "true",
        // No lookups on the internet in the tests: the check finds nothing set.
        DOH_URL: "http://127.0.0.1:9/dns-query",
        // An authority of the tests' own, trusted for S/MIME (e2e/smime-ca, test keys only).
        SMIME_ROOTS: "e2e/smime-ca/root.pem",
        // Microsoft's sign-in and Graph: the stand-in below
        M365_LOGIN_URL: `http://127.0.0.1:${GRAPH_PORT}`,
        GRAPH_URL: `http://127.0.0.1:${GRAPH_PORT}/v1.0`,
        SCHREIBZEUG_URL: `http://localhost:${SCHREIBZEUG_PORT}`,
        SCHREIBZEUG_CLIENT_SECRET: SCHREIBZEUG_DEV_SECRET,
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `bunx vite --port ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}`,
      env: {
        KONTEXT_SERVER: `http://127.0.0.1:${SERVER_PORT}`,
        KONTEXT_LIVEKIT: `http://127.0.0.1:${LIVEKIT_PORT}`,
        PORT: String(APP_PORT),
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
