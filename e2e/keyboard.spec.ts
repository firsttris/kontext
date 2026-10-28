import { expect, test } from "@playwright/test";
import { inboxSubjects, login, unique } from "./helpers";

/**
 * Keyboard only, as someone works without a mouse: past the rail to the content, through dialogs
 * and back to where they were, the small month as one stop with the arrow keys, sending with
 * Strg+Enter. docs/accessibility.md.
 */
test.describe("Mit der Tastatur", () => {
  test.beforeEach(async ({ page }) => login(page));

  test("der erste Tab-Stopp springt zum Inhalt", async ({ page }) => {
    await page.goto("/mail");
    await expect(page.getByRole("link", { name: "Neue Mail" }).first()).toBeVisible();
    await page.keyboard.press("Tab");
    const skip = page.getByRole("button", { name: "Zum Inhalt springen" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    const list = page.getByRole("region", { name: "Nachrichtenliste" });
    await expect(list).toBeFocused();
    await page.keyboard.press("Tab");
    // The next stop is in the mail list, past the rail and the folders.
    await expect(list.locator(":focus")).toHaveCount(1);
  });

  test("ein Dialog gibt den Fokus beim Schließen dorthin zurück, wo er geöffnet wurde", async ({
    page,
  }) => {
    await page.goto("/calendar");
    const newEvent = page.getByRole("link", { name: "Neuer Termin" }).first();
    await newEvent.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(newEvent).toBeFocused();
  });

  test("„Neue Aufgabe“ beginnt im Titel", async ({ page }) => {
    await page.goto("/tasks");
    const button = page.getByRole("button", { name: "Neue Aufgabe" }).first();
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog").getByLabel("Titel")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(button).toBeFocused();
  });

  test("der kleine Monat ist ein Tab-Stopp, die Pfeiltasten gehen von Tag zu Tag", async ({
    page,
  }) => {
    await page.goto("/calendar?date=2026-10-14");
    const day = (name: string) => page.getByRole("link", { name, exact: true });
    await day("Mittwoch, 14. Oktober 2026").focus();
    await page.keyboard.press("ArrowRight");
    await expect(day("Donnerstag, 15. Oktober 2026")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(day("Donnerstag, 22. Oktober 2026")).toBeFocused();
    await page.keyboard.press("PageDown");
    await expect(day("Sonntag, 1. November 2026")).toBeFocused();
    await expect(page.getByText("November 2026")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/date=2026-11-01/);
    // One stop for Tab: the month's other days are out of the order.
    const stops = await page
      .getByRole("link", { name: /\d{4}$/ })
      .evaluateAll(
        (links) => links.filter((link) => link.getAttribute("tabindex") !== "-1").length,
      );
    expect(stops).toBe(1);
  });

  test("Strg+Enter sendet die Mail", async ({ page }) => {
    const subject = unique("Per Tastatur");
    await page.goto("/mail");
    await expect(page.getByRole("link", { name: "Neue Mail" }).first()).toBeVisible();
    await page.keyboard.press("c");
    const to = page.getByRole("combobox", { name: "An" });
    await expect(to).toBeFocused();
    await page.keyboard.type("anna");
    await page.getByRole("option", { name: /Anna Weber/ }).click();
    await page.getByLabel("Betreff").fill(subject);
    await page.getByLabel("Betreff").press("Control+Enter");
    await expect(page.getByRole("status")).toHaveText("Mail gesendet.");
    await expect.poll(() => inboxSubjects("anna")).toContain(subject);
  });
});
