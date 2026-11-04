import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

/** The browser's own spell checker: on for the mail text and the subject, in German. */
const checksSpelling = async (page: Page) => {
  await login(page);
  await page.getByRole("link", { name: "Neue Mail" }).first().click();
  for (const field of [
    page.getByRole("textbox", { name: "Ihre Nachricht …" }),
    page.getByRole("textbox", { name: "Betreff" }),
  ]) {
    await expect(field).toHaveAttribute("spellcheck", "true");
    await expect(field).toHaveAttribute("lang", "de");
  }
};

test.describe("Rechtschreibprüfung", () => {
  test("ist beim Schreiben einer Mail an, auf Deutsch", async ({ page }) => {
    await checksSpelling(page);
  });

  test("ist am Handy beim Schreiben an @phone", async ({ page }) => {
    await checksSpelling(page);
  });
});
