import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

/** Yesterday's appointment from the seed: found by a word, opened from the hit. */
const findPastAppointment = async (page: Page) => {
  await page.goto("/calendar");
  const field = page.getByRole("searchbox", { name: "Termine suchen" });
  // A phone shows the field after a tap on the magnifier.
  if (page.viewportSize()!.width < 768) {
    await page.getByRole("button", { name: "Termine suchen" }).click();
  }
  await field.fill("Wartung");
  const hits = page.getByRole("list", { name: "Gefundene Termine" });
  await hits.getByRole("link", { name: /Wartung Halle 2/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Wartung Halle 2 – Keller Elektro" }),
  ).toBeVisible();
  await expect(hits).toHaveCount(0);
};

/** A new task, found from the search field by a word in its title and opened. */
const findTask = async (page: Page) => {
  const word = `Zaunpfosten${Date.now() % 100_000}`;
  const name = `Rückruf ${word}`;
  await page.goto("/tasks");
  await page.getByRole("textbox", { name: "Neue Aufgabe" }).fill(name);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await page.getByRole("searchbox", { name: "Aufgaben suchen" }).fill(word.toLowerCase());
  const hits = page.getByRole("region", { name: "Gefundene Aufgaben" });
  await hits.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page.getByRole("article", { name })).toBeVisible();
};

test.describe("Suche in Kalender und Aufgaben", () => {
  test("findet einen vergangenen Termin und öffnet ihn", async ({ page }) => {
    await login(page);
    await findPastAppointment(page);
  });

  test("findet eine Aufgabe und öffnet sie", async ({ page }) => {
    await login(page);
    await findTask(page);
  });
});

test.describe("Suche in Kalender und Aufgaben am Handy @phone", () => {
  test("findet einen Termin und öffnet ihn @phone", async ({ page }) => {
    await login(page);
    await findPastAppointment(page);
  });

  test("findet eine Aufgabe und öffnet sie @phone", async ({ page }) => {
    await login(page);
    await findTask(page);
  });
});
