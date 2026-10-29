import { expect, type Page, test } from "@playwright/test";
import { inboxSubjects, login, unique } from "./helpers";

/** A new mail to Max with that subject and text, then "Senden". */
const write = async (page: Page, subject: string, text: string) => {
  await page.getByRole("link", { name: "Neue Mail" }).first().click();
  const to = page.getByRole("combobox", { name: "An" });
  await to.fill("max");
  await page.getByRole("option", { name: /Max Becker/ }).click();
  await page.getByLabel("Betreff").fill(subject);
  await page.getByRole("textbox", { name: "Ihre Nachricht …" }).fill(text);
  await page.getByRole("button", { name: "Senden", exact: true }).click();
};

test.describe("Anhang vergessen?", () => {
  test("fragt nach, wenn der Text einen Anhang nennt, und sendet auf Wunsch ohne", async ({
    page,
  }) => {
    const subject = unique("Angebot Bad");
    await login(page);
    await write(page, subject, "Hallo Max, anbei das Angebot für das Bad.");
    const ask = page.getByRole("dialog", { name: "Anhang vergessen?" });
    await expect(ask).toContainText("Im Text steht „anbei“, aber es ist nichts angehängt.");
    await ask.getByRole("button", { name: "Ohne Anhang senden" }).click();
    await expect(page.getByRole("status")).toHaveText("Mail gesendet.");
    await expect.poll(() => inboxSubjects("max")).toContain(subject);
  });

  test("hängt aus der Rückfrage eine Datei an, dann geht die Mail ohne weitere Frage", async ({
    page,
  }) => {
    const subject = unique("Lieferschein");
    await login(page);
    await write(page, subject, "Der Lieferschein ist angehängt.");
    const ask = page.getByRole("dialog", { name: "Anhang vergessen?" });
    await ask.locator('input[type="file"]').setInputFiles({
      name: "Lieferschein-4711.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Lieferschein 4711"),
    });
    await expect(ask).toHaveCount(0);
    await expect(page.getByText("Lieferschein-4711.txt")).toBeVisible();
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Mail gesendet.");
    await expect.poll(() => inboxSubjects("max")).toContain(subject);
  });

  test("fragt nicht, wenn der Text keinen Anhang nennt @phone", async ({ page }) => {
    const subject = unique("Rückfrage Termin");
    await login(page);
    await write(page, subject, "Passt mir am Freitag.");
    await expect(page.getByRole("dialog", { name: "Anhang vergessen?" })).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("Mail gesendet.");
  });
});
