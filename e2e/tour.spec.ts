import { expect, type Page, test } from "@playwright/test";
import { address, login } from "./helpers";

/** The tour as on a first start: `login` marks it seen for every other test. */
const firstStart = async (page: Page) => {
  await login(page, "jonas", { tour: true });
  // Named by its step's heading; "Schritt 1 von 6" is the tour's alone.
  const tour = page.getByRole("dialog").filter({ hasText: /Schritt \d+ von \d+/ });
  await expect(tour).toBeVisible();
  return tour;
};

const box = async (page: Page, selector: string) =>
  (await page.locator(selector).filter({ visible: true }).first().boundingBox())!;

test.describe("Einführung", () => {
  test("führt beim ersten Start durch Mail, Kalender und Chat und kommt nicht wieder", async ({
    page,
  }) => {
    const tour = await firstStart(page);
    await expect(tour.getByRole("heading", { name: "Willkommen bei Kontext" })).toBeVisible();
    await expect(tour).toContainText("Schritt 1 von 6");
    await expect(tour.getByRole("button", { name: "Weiter" })).toBeFocused();
    await expect(tour.getByRole("button", { name: "Zurück" })).toHaveCount(0);

    // Each step points at its place: the card beside the rail's "E-Mail".
    await tour.getByRole("button", { name: "Weiter" }).click();
    await expect(tour.getByRole("heading", { name: "E-Mail" })).toBeVisible();
    const rail = await box(page, '[data-tour="app:/mail"]');
    await expect
      .poll(async () => (await tour.boundingBox())!.x)
      .toBeGreaterThan(rail.x + rail.width);

    await tour.getByRole("button", { name: "Weiter" }).click();
    await expect(tour.getByRole("heading", { name: "Neue E-Mail" })).toBeVisible();
    await tour.getByRole("button", { name: "Zurück" }).click();
    await expect(tour.getByRole("heading", { name: "E-Mail" })).toBeVisible();
    await tour.getByRole("button", { name: "Weiter" }).click();
    await tour.getByRole("button", { name: "Weiter" }).click();
    await expect(tour.getByRole("heading", { name: "Gemeinsame Postfächer" })).toBeVisible();
    await expect(tour).toContainText("info@");
    await tour.getByRole("button", { name: "Weiter" }).click();
    await expect(tour.getByRole("heading", { name: "Kalender" })).toBeVisible();
    await tour.getByRole("button", { name: "Weiter" }).click();
    await expect(tour.getByRole("heading", { name: "Chat" })).toBeVisible();
    await expect(tour).toContainText("Schritt 6 von 6");
    await expect(tour.getByRole("button", { name: "Überspringen" })).toHaveCount(0);
    await tour.getByRole("button", { name: "Fertig" }).click();
    await expect(tour).toBeHidden();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Posteingang" })).toBeVisible();
    await expect(tour).toBeHidden();
  });

  test("hält den Fokus, Escape überspringt, das Menü startet sie wieder", async ({ page }) => {
    const tour = await firstStart(page);
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      expect(await tour.evaluate((card) => card.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(tour).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Posteingang" })).toBeVisible();
    await expect(tour).toBeHidden();

    await page.getByRole("button", { name: address("jonas") }).click();
    await page.getByRole("menuitem", { name: "Einführung" }).click();
    await expect(tour).toBeVisible();
    await expect(tour).toContainText("Schritt 1 von 6");
    await tour.getByRole("button", { name: "Überspringen" }).click();
    await expect(tour).toBeHidden();
  });

  test("zeigt zwischen md und lg nur auf, was da ist", async ({ page }) => {
    // From md the rail, the mail sidebar only from lg: no "Neue E-Mail" and no info@ to point at.
    await page.setViewportSize({ width: 900, height: 800 });
    const tour = await firstStart(page);
    const headings: string[] = [];
    for (;;) {
      const heading = (await tour.getByRole("heading").textContent()) ?? "";
      headings.push(heading);
      if (heading !== "Willkommen bei Kontext") {
        // Each card after the welcome lights up its place on the screen.
        await expect(page.locator("div.fixed.ring-2.ring-primary")).toBeVisible();
      }
      const next = tour.getByRole("button", { name: /^(Weiter|Fertig)$/ });
      if ((await next.textContent()) === "Fertig") break;
      await next.click();
      await expect(tour.getByRole("heading")).not.toHaveText(heading);
    }
    expect(headings).toEqual(["Willkommen bei Kontext", "E-Mail", "Kalender", "Chat"]);
  });

  test("zeigt am Handy auf die Leiste unten @phone", async ({ page }) => {
    const tour = await firstStart(page);
    await tour.getByRole("button", { name: "Weiter" }).click();
    await expect(tour.getByRole("heading", { name: "E-Mail" })).toBeVisible();
    await expect(tour).toContainText("In der Leiste unten");
    // The card above the tab bar's "E-Mail", the tab lit up below it.
    const tab = await box(page, '[data-tour="app:/mail"]');
    await expect
      .poll(async () => {
        const card = (await tour.boundingBox())!;
        return card.y + card.height;
      })
      .toBeLessThanOrEqual(tab.y);

    await tour.getByRole("button", { name: "Überspringen" }).click();
    await expect(tour).toBeHidden();

    await page.getByRole("button", { name: /^Mehr/ }).click();
    await page.getByRole("menuitem", { name: "Einführung" }).click();
    await expect(tour).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tour).toBeHidden();
  });
});
