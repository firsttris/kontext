import { expect, test } from "@playwright/test";
import { address, login, unique } from "./helpers";
import { deliverMail } from "./protocols";

test.describe("Unterhaltungen", () => {
  test("zeigt frühere und neuere Mails, wer geantwortet hat, und faltet das Zitat", async ({
    page,
    browser,
  }) => {
    const subject = unique("Rückfrage Heizkörper");
    const first = `${crypto.randomUUID()}@kunde.test`;
    await deliverMail({
      from: "lisa@kunde.test",
      fromName: "Lisa Brandt",
      to: address("info"),
      subject,
      body: "Guten Tag, wann können Sie die Heizkörper tauschen?",
      messageId: first,
    });

    // Jonas answers as info@.
    await login(page);
    await page.getByRole("link", { name: "info@" }).click();
    await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
    await page.getByRole("link", { name: /Antworten an Lisa/ }).click();
    await page.getByRole("textbox", { name: "Ihre Nachricht …" }).click();
    await page.keyboard.type("Wir melden uns morgen mit einem Termin.");
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Mail gesendet." })).toBeVisible();

    // The customer answers, quoting.
    await deliverMail({
      from: "lisa@kunde.test",
      fromName: "Lisa Brandt",
      to: address("info"),
      subject: `Re: ${subject}`,
      body: "Danke, Dienstag passt gut.\n\nAm 24.10.2026 schrieb Weber Haustechnik:\n> Wir melden uns morgen mit einem Termin.",
      inReplyTo: first,
    });

    // Anna sees in the list who answered, and the conversation in the mail.
    const anna = await (await browser.newContext()).newPage();
    await login(anna, "anna");
    await anna.getByRole("link", { name: "info@" }).click();
    const list = anna.getByRole("list", { name: "Posteingang" });
    const original = list.getByRole("link", { name: new RegExp(`^(?!.*Re: ).*${subject}`) });
    await expect(original.getByTitle(/^Beantwortet von Jonas Weber/)).toBeVisible();
    await expect(original).toContainText("Jonas ·");

    await list.getByText(`Re: ${subject}`).click();
    const earlier = anna.getByRole("button", {
      name: "2 frühere Nachrichten in dieser Unterhaltung",
    });
    await expect(earlier).toBeVisible();
    await earlier.click();
    const lines = anna.getByRole("region", { name: "Frühere Nachrichten" });
    await expect(lines).toContainText("Lisa Brandt");
    await expect(lines).toContainText("Gesendet");

    const body = anna.frameLocator("iframe");
    await expect(body.getByText("Danke, Dienstag passt gut.")).toBeVisible();
    await expect(body.getByText("Wir melden uns morgen")).toHaveCount(0);
    await anna.getByRole("button", { name: "Zitierten Text anzeigen" }).click();
    await expect(body.getByText("Wir melden uns morgen")).toBeVisible();

    // From the first mail, the answers since are below it.
    // The oldest line is her first mail.
    await lines.getByRole("link").first().click();
    await expect(anna.getByRole("region", { name: "Neuere Nachrichten" })).toContainText(
      "2 neuere Nachrichten in dieser Unterhaltung",
    );
  });

  test("gruppiert auf Wunsch und archiviert die ganze Unterhaltung", async ({ page }) => {
    const subject = unique("Termin Wartung Therme");
    const first = `${crypto.randomUUID()}@kunde.test`;
    const mail = { from: "paul@kunde.test", fromName: "Paul Simon", to: address("info") };
    await deliverMail({ ...mail, subject, body: "Wann kommen Sie?", messageId: first });
    await deliverMail({
      ...mail,
      subject: `Re: ${subject}`,
      body: "Noch eine Frage.",
      inReplyTo: first,
    });
    await login(page);
    await page.goto("/settings?section=appearance");
    await page.getByText("Mails als Unterhaltungen gruppieren").click();
    await page
      .getByRole("link", { name: /^Mail($|, )/ })
      .first()
      .click();
    await page.getByRole("link", { name: "info@" }).click();
    const list = page.getByRole("list", { name: "Posteingang" });
    const line = list.getByRole("link", { name: new RegExp(subject) });
    await expect(line).toHaveCount(1);
    await expect(line).toContainText("2 Mails in dieser Unterhaltung");
    await line.click();
    await page.getByRole("button", { name: "Archivieren" }).click();
    await expect(list.getByText(subject)).toHaveCount(0);
    // Back to single mails: both are in the archive.
    await page.goto("/settings?section=appearance");
    await page.getByText("Mails als Unterhaltungen gruppieren").click();
    await page
      .getByRole("link", { name: /^Mail($|, )/ })
      .first()
      .click();
    await page.getByRole("link", { name: "info@" }).click();
    await page.getByRole("link", { name: "Archiv" }).click();
    await expect(page.getByRole("list", { name: "Archiv" }).getByText(subject)).toHaveCount(2);
  });
});
