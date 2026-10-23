import { expect, test } from "@playwright/test";
import { login, unique } from "./helpers";

const day = (offset: number) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
const today = () => day(0);
/** Invitations are only sent for future events, so that test plans for tomorrow. */
const tomorrow = () => day(1);

test.describe("Kalender", () => {
  test("zeigt die Woche mit den Terminen", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Kalender" }).first().click();
    await expect(page.getByText(/KW \d+/)).toBeVisible();
    await expect(
      page.locator(`[data-day="${today()}"]`).getByText("Baubesprechung Hoffmann"),
    ).toBeVisible();
  });

  test("legt einen Termin mit Einladung an, Anna sagt zu", async ({ page, browser }) => {
    test.setTimeout(90_000);
    const title = unique("Abnahme Bad");
    await login(page);
    await page.goto(`/calendar?date=${tomorrow()}&event=new&start=${tomorrow()}T15:00`);
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Titel").fill(title);
    await dialog.getByLabel("Ort").fill("Hauptstraße 41");
    await dialog.getByLabel("Teilnehmer").fill("anna@weber-haustechnik.test");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("status")).toHaveText("Einladungen werden verschickt.");
    const block = page.locator(`[data-day="${tomorrow()}"]`).getByText(title);
    await expect(block).toBeVisible();

    // Anna sees the invitation and accepts it.
    const anna = await (
      await browser.newContext({ locale: "de-DE", timezoneId: "Europe/Berlin" })
    ).newPage();
    await login(anna, "anna");
    // Delivery to Anna's calendar runs in the background on the server.
    await expect
      .poll(
        async () => {
          await anna.goto(`/calendar?date=${tomorrow()}`);
          return anna
            .locator(`[data-day="${tomorrow()}"]`)
            .getByText(title)
            .waitFor({ timeout: 3_000 })
            .then(() => true)
            .catch(() => false);
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    await anna.locator(`[data-day="${tomorrow()}"]`).getByText(title).click();
    await anna.getByRole("button", { name: "Zusagen" }).click();
    await expect(anna.getByRole("button", { name: "Zusagen" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Jonas sees the answer.
    await expect
      .poll(
        async () => {
          await page.goto(`/calendar?date=${tomorrow()}`);
          await page.locator(`[data-day="${tomorrow()}"]`).getByText(title).click();
          const text = (await page.getByRole("list", { name: "Teilnehmer" }).textContent()) ?? "";
          await page.keyboard.press("Escape");
          return text;
        },
        { timeout: 20_000 },
      )
      .toMatch(/anna@weber-haustechnik\.test\s*zugesagt/);
  });

  test("ändert und löscht einen Termin", async ({ page }) => {
    const title = unique("Telefonat");
    await login(page);
    await page.goto(`/calendar?event=new&start=${today()}T17:00`);
    await page.getByRole("dialog").getByLabel("Titel").fill(title);
    await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
    const day = page.locator(`[data-day="${today()}"]`);
    await day.getByText(title).click();
    await page.getByRole("dialog").getByRole("button", { name: "Bearbeiten" }).click();
    await page.getByRole("dialog").getByLabel("Titel").fill(`${title} verschoben`);
    await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
    await expect(day.getByText(`${title} verschoben`)).toBeVisible();
    await day.getByText(`${title} verschoben`).click();
    await page.getByRole("dialog").getByRole("button", { name: "Termin löschen" }).click();
    await expect(day.getByText(`${title} verschoben`)).toHaveCount(0);
  });

  test("prüft die Eingaben", async ({ page }) => {
    await login(page);
    await page.goto(`/calendar?event=new&start=${today()}T10:00`);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Bitte einen Titel angeben.");
    await dialog.getByLabel("Titel").fill("Test");
    await dialog.getByLabel("Ende Uhrzeit").fill("09:00");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Das Ende liegt vor dem Beginn.");
  });
});

test.describe("Kalender am Handy @phone", () => {
  test("Tagesansicht mit Wochenleiste und neuem Termin", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Kalender" }).click();
    await expect(page.getByRole("navigation", { name: "Woche" })).toBeVisible();
    await expect(page.getByText("Baubesprechung Hoffmann")).toBeVisible();
    await page.getByRole("link", { name: "Neuer Termin", exact: true }).click();
    await expect(page.getByRole("dialog").getByLabel("Titel")).toBeVisible();
  });
});
