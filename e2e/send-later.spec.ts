import { expect, type Page, test } from "@playwright/test";
import { inboxSubjects, login, unique } from "./helpers";

const writeToAnna = async (page: Page, subject: string) => {
  await page.getByRole("link", { name: "Neue Mail" }).first().click();
  await page.getByRole("combobox", { name: "An" }).fill("anna@weber-haustechnik.test");
  await page.keyboard.press("Enter");
  await page.getByLabel("Betreff").fill(subject);
  await page.getByRole("textbox", { name: "Ihre Nachricht …" }).click();
  await page.keyboard.type("Bitte bis Freitag.");
};

test.describe("Senden rückgängig und später senden", () => {
  test("holt eine gerade gesendete Mail zurück", async ({ page }) => {
    const subject = unique("Doch noch nicht");
    await login(page);
    await page.evaluate(() => window.localStorage.setItem("kontext.mail.undo", "10"));
    await writeToAnna(page, subject);
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    const sent = page.getByRole("status").filter({ hasText: "Mail gesendet." });
    await sent.getByRole("button", { name: "Rückgängig" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Nicht gesendet" })).toBeVisible();
    // Back as a draft, to change and send again.
    await expect(page.getByRole("textbox", { name: "Betreff" })).toHaveValue(subject);
    await page.waitForTimeout(12_000);
    expect(await inboxSubjects("anna")).not.toContain(subject);
  });

  test("plant eine Mail, zeigt sie unter Geplant und holt sie zurück", async ({ page }) => {
    const subject = unique("Erst morgen früh");
    await login(page);
    await writeToAnna(page, subject);
    await page.getByRole("button", { name: "Später senden" }).click();
    await page.getByRole("menuitem", { name: "Zeitpunkt wählen …" }).click();
    const dialog = page.getByRole("dialog", { name: "Später senden" });
    const tomorrow = new Date(Date.now() + 86_400_000);
    const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(tomorrow);
    await dialog.getByLabel("Senden am").fill(`${day}T08:00`);
    await dialog.getByRole("button", { name: "Planen" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /^Wird .* 08:00 gesendet\./ }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Gesendet" }).click();
    await page.getByRole("link", { name: /^Geplant/ }).click();
    const list = page.getByRole("list", { name: "Gesendet" });
    const row = list.getByRole("link", { name: new RegExp(subject) });
    await expect(row).toContainText("Geplant ·");
    await row.click();
    // The notice in the mail, once the toast with the same words has gone.
    await expect(page.getByRole("status").filter({ hasText: "gesendet" })).toHaveCount(0);
    await expect(page.getByText(/^Wird .* 08:00 gesendet\./)).toBeVisible();
    await page.getByRole("button", { name: "Nicht senden" }).click();
    await expect(page.getByRole("textbox", { name: "Betreff" })).toHaveValue(subject);
    await page.getByRole("link", { name: "Gesendet" }).click();
    await page.getByRole("link", { name: /^Geplant/ }).click();
    await expect(list.getByText(subject)).toHaveCount(0);
    expect(await inboxSubjects("anna")).not.toContain(subject);
  });
});
