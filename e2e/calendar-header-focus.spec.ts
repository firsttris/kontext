import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

/** The brightness (0–255) of one pixel on the screen, read through a canvas in the page. */
const brightness = async (page: Page, x: number, y: number) => {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  return page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return (r! + g! + b!) / 3;
  }, png.toString("base64"));
};

test("Der Tastaturfokus auf einem Tag der Kopfzeile ist ganz zu sehen", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Kalender" }).first().click();
  const header = page.locator(`[data-day-header="${today()}"]`);
  await expect(header).toBeVisible();
  // Reached with the keyboard, so the ring of :focus-visible shows.
  await header.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(header).toBeFocused();
  expect(await header.evaluate((link) => link.matches(":focus-visible"))).toBe(true);
  const box = (await header.boundingBox())!;
  const middle = Math.round(box.x + box.width / 2);
  // The header row clips what lies outside the link, so the ring has to sit just inside its edges.
  expect(await brightness(page, middle, Math.ceil(box.y) + 1)).toBeLessThan(128);
  expect(await brightness(page, middle, Math.floor(box.y + box.height) - 2)).toBeLessThan(128);
});
