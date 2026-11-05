import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

// A fixed week: Monday 2 to Sunday 8 November 2026; 56 px per hour (week-grid.tsx HOUR_HEIGHT).
const MONDAY = "2026-11-02";
const SATURDAY = "2026-11-07";
const SUNDAY = "2026-11-08";
const HOUR = 56;

const shadedHeights = (page: Page, day: string) =>
  page
    .locator(`[data-day="${day}"] [data-off-hours]`)
    .evaluateAll((parts) => parts.map((part) => Math.round(part.getBoundingClientRect().height)));

test.describe("Arbeitswoche und Arbeitszeit", () => {
  test("Arbeitswoche zeigt Montag bis Freitag, die Arbeitszeit ist hinterlegt", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/calendar?view=week&date=${MONDAY}`);
    await expect(page.locator("[data-day]")).toHaveCount(7);

    await page.getByRole("link", { name: "Arbeitswoche" }).click();
    await expect(page).toHaveURL(/view=workweek/);
    await expect(page.locator("[data-day]")).toHaveCount(5);
    await expect(page.locator(`[data-day-header="${SATURDAY}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-day-header="${SUNDAY}"]`)).toHaveCount(0);
    // The choice is in the address, so it stays on reload and on the next week.
    await page.reload();
    await expect(page.locator("[data-day]")).toHaveCount(5);
    await page.getByRole("link", { name: "Weiter" }).click();
    await expect(page).toHaveURL(/date=2026-11-09/);
    await expect(page.locator("[data-day]")).toHaveCount(5);

    // By default 07:00–18:00: shaded before and after; the weekend is shaded as a whole already.
    await page.goto(`/calendar?view=week&date=${MONDAY}`);
    await expect(page.locator(`[data-day="${MONDAY}"]`)).toBeVisible();
    expect(await shadedHeights(page, MONDAY)).toEqual([7 * HOUR, 6 * HOUR]);
    expect(await shadedHeights(page, SATURDAY)).toEqual([]);

    await page.goto("/settings?section=appearance");
    await page.getByLabel("Von", { exact: true }).selectOption("8");
    await page.getByLabel("bis", { exact: true }).selectOption("16");
    await page.goto(`/calendar?view=workweek&date=${MONDAY}`);
    const column = page.locator(`[data-day="${MONDAY}"]`);
    await expect(column).toBeVisible();
    expect(await shadedHeights(page, MONDAY)).toEqual([8 * HOUR, 8 * HOUR]);
    // The grid opens at the start of the working day.
    await expect
      .poll(() => column.locator("xpath=../..").evaluate((scroller) => scroller.scrollTop))
      .toBe(8 * HOUR - 8);
  });

  test("am Handy: keine Arbeitswoche, die Arbeitszeit lässt sich einstellen @phone", async ({
    page,
  }) => {
    await login(page);
    // A phone shows one day at a time: a work week from a shared link opens as the day.
    await page.goto(`/calendar?view=workweek&date=${MONDAY}`);
    await expect(page.getByRole("navigation", { name: "Woche" })).toBeVisible();
    await expect(page.locator("[data-day]")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Arbeitswoche" })).toHaveCount(0);
    expect(await shadedHeights(page, MONDAY)).toEqual([7 * HOUR, 6 * HOUR]);

    await page.goto("/settings?section=appearance");
    await page.getByLabel("Von", { exact: true }).selectOption("6");
    await page.goto(`/calendar?date=${MONDAY}`);
    await expect(page.locator(`[data-day="${MONDAY}"]`)).toBeVisible();
    expect(await shadedHeights(page, MONDAY)).toEqual([6 * HOUR, 6 * HOUR]);
  });
});
