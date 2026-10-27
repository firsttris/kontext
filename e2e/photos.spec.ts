import { expect, type Page, test } from "@playwright/test";
import { login, unique } from "./helpers";

/** A small picture (1×1, red) as one picks it from the phone or computer. */
const PICTURE = {
  name: "ich.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
    "base64",
  ),
};

const setOwnPhoto = async (page: Page) => {
  await page.goto("/settings?section=profile");
  await page.getByLabel("Foto", { exact: true }).setInputFiles(PICTURE);
  await expect(page.getByRole("status").filter({ hasText: "Foto gespeichert." })).toBeVisible();
};

const removeOwnPhoto = async (page: Page) => {
  await page.goto("/settings?section=profile");
  await page.getByRole("button", { name: "Foto entfernen" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Foto entfernt." })).toBeVisible();
};

test.describe("Fotos", () => {
  test("Max legt ein Profilfoto an, Jonas sieht es im Chat", async ({ page, browser }) => {
    const max = await (await browser.newContext()).newPage();
    await login(max, "max");
    await setOwnPhoto(max);
    try {
      // In the rail at once, as his own avatar.
      await expect(max.locator('img[src^="/api/photos/"]').first()).toBeVisible();

      await login(page, "jonas");
      await page.goto("/chat");
      await page.getByRole("button", { name: "Neue Nachricht" }).click();
      const dialog = page.getByRole("dialog", { name: "Neue Nachricht" });
      const row = dialog.getByRole("checkbox", { name: "Max Becker" }).locator("..");
      await expect(row.locator('img[src^="/api/photos/"]')).toBeVisible();
      // Anna has none: her initials.
      await expect(
        dialog.getByRole("checkbox", { name: "Anna Weber" }).locator("..").locator("img"),
      ).toHaveCount(0);
    } finally {
      await removeOwnPhoto(max);
    }
    await expect(max.locator('img[src^="/api/photos/"]')).toHaveCount(0);
  });

  test("ein Kontakt bekommt ein Foto und verliert es wieder", async ({ page }) => {
    await login(page, "jonas");
    await page.goto("/contacts");
    const surname = unique("Foto");
    await page.getByRole("link", { name: "Neuer Kontakt" }).click();
    await page.getByLabel("Vorname").fill("Ida");
    await page.getByLabel("Nachname").fill(surname);
    await page.getByLabel("Foto", { exact: true }).setInputFiles(PICTURE);
    await expect(page.locator('form img[src^="data:image/jpeg"]')).toBeVisible();
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("heading", { name: `Ida ${surname}` })).toBeVisible();
    await expect(page.locator('main img[src^="data:image/jpeg"]').first()).toBeVisible();

    await page.getByRole("link", { name: "Bearbeiten" }).click();
    await page.getByRole("button", { name: "Foto entfernen" }).click();
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("heading", { name: `Ida ${surname}` })).toBeVisible();
    await expect(page.locator('main img[src^="data:image/jpeg"]')).toHaveCount(0);
  });
});

test.describe("Fotos am Handy @phone", () => {
  test("legt das eigene Profilfoto an und entfernt es @phone", async ({ page }) => {
    await login(page, "sandra");
    await setOwnPhoto(page);
    await expect(page.locator('section img[src^="/api/photos/"]')).toBeVisible();
    await removeOwnPhoto(page);
    await expect(page.locator('section img[src^="/api/photos/"]')).toHaveCount(0);
  });
});
