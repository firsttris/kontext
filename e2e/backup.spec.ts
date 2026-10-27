import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/** The e2e server's data directory (playwright.config.ts); the tests play the host's part. */
const CONTROL = join(".dev", "e2e-server", "backup-control");

const iso = (offsetMinutes: number) =>
  new Date(Date.now() + offsetMinutes * 60_000).toISOString().replace(/\.\d+Z$/, "Z");

/** What deploy/backup-control.sh writes. */
const hostWrites = (change: Record<string, unknown> = {}) => {
  mkdirSync(CONTROL, { recursive: true });
  writeFileSync(
    join(CONTROL, "status.json"),
    JSON.stringify({
      state: "idle",
      updatedAt: iso(0),
      lastRun: { start: iso(-10), end: iso(-6), ok: true, message: "backup ok" },
      sizeBytes: 838_860,
      warnGb: 8,
      nextRun: iso(12 * 60),
      target: "Cloudflare R2 (kontext-weber)",
      schedule: { enabled: true, time: "03:00" },
      ...change,
    }),
  );
  writeFileSync(join(CONTROL, "log.txt"), "restic: snapshot 1a2b3c saved\nbackup ok\n");
};

test.describe("Firmenverwaltung: Datensicherung", () => {
  test.beforeEach(() => rmSync(CONTROL, { recursive: true, force: true }));
  test.afterAll(() => rmSync(CONTROL, { recursive: true, force: true }));

  test("sagt, wenn der Server nicht eingerichtet ist", async ({ page }) => {
    await login(page);
    await page.goto("/settings?section=company-backup");
    await expect(page.getByText("Steuerung auf dem Server nicht eingerichtet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Zur Anleitung" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Jetzt sichern" })).toHaveCount(0);
  });

  test("zeigt den letzten Lauf, stellt die Uhrzeit und sichert auf Wunsch", async ({ page }) => {
    hostWrites();
    await login(page);
    await page.goto("/settings?section=company-backup");
    await expect(page.getByText("Cloudflare R2 (kontext-weber)")).toBeVisible();
    await expect(page.getByText(/erfolgreich · 4 Min/)).toBeVisible();
    await expect(page.getByText("819 KB von 10 GB")).toBeVisible();
    await expect(page.getByText(/Nächste: (heute|morgen)/)).toBeVisible();

    await page.getByLabel("Uhrzeit").fill("04:30");
    await page.getByLabel("Uhrzeit").blur();
    await expect(page.getByText("Gespeichert.")).toBeVisible();
    expect(JSON.parse(readFileSync(join(CONTROL, "settings.json"), "utf8"))).toEqual({
      enabled: true,
      time: "04:30",
    });

    await page.getByRole("button", { name: "Jetzt sichern" }).click();
    await expect(page.getByText("angefordert …")).toBeVisible();
    await expect(page.getByRole("button", { name: "Jetzt sichern" })).toBeDisabled();
    expect(existsSync(join(CONTROL, "run-now"))).toBe(true);

    // The host takes it up, runs, and is done: the page follows on its own.
    rmSync(join(CONTROL, "run-now"));
    hostWrites({ state: "running" });
    await expect(page.getByText("läuft gerade …")).toBeVisible();
    hostWrites({
      lastRun: {
        start: iso(-1),
        end: iso(0),
        ok: false,
        message: "Fatal: unable to open repository",
      },
    });
    await expect(page.getByText("Fatal: unable to open repository")).toBeVisible();
    await expect(page.getByRole("button", { name: "Jetzt sichern" })).toBeEnabled();

    await page.getByText("Protokoll der letzten Läufe").click();
    await expect(page.getByText("restic: snapshot 1a2b3c saved")).toBeVisible();
  });

  test("schaltet die automatische Sicherung aus @phone", async ({ page }) => {
    hostWrites();
    await login(page);
    await page.goto("/settings?section=company-backup");
    await page.getByRole("switch", { name: "Automatisch täglich" }).click();
    await expect(page.getByText("Keine automatische Sicherung.")).toBeVisible();
    await expect(page.getByLabel("Uhrzeit")).toBeDisabled();
    expect(JSON.parse(readFileSync(join(CONTROL, "settings.json"), "utf8")).enabled).toBe(false);
  });
});
