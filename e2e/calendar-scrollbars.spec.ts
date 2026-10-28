import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Playwright hides scrollbars; the shift the time grid's scrollbar caused only shows with them.
test.use({
  launchOptions: {
    ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    ignoreDefaultArgs: ["--hide-scrollbars"],
  },
});

const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

test("Kopfzeile und Stundenraster stehen bündig übereinander", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Kalender" }).first().click();
  const column = page.locator(`[data-day="${today()}"]`);
  await expect(column).toBeVisible();
  const grid = await column.boundingBox();
  const header = await page.locator(`[data-day-header="${today()}"]`).boundingBox();
  expect(Math.round(header!.x)).toBe(Math.round(grid!.x));
  expect(Math.round(header!.width)).toBe(Math.round(grid!.width));
});
