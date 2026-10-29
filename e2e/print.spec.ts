import { expect, test } from "@playwright/test";
import { login } from "./helpers";
import { copySeedMail } from "./own-mails";
import { printed, recordPrints } from "./printed";

test.describe("Drucken", () => {
  test("druckt die offene Mail ohne die App drumherum", async ({ page, browser }) => {
    // A copy of the seed's offer, on top of the inbox (own-mails.ts).
    const offer = await copySeedMail("jonas", "angebot-wartung@keller-elektro.test");
    try {
      await login(page);
      await page.getByRole("list", { name: "Posteingang" }).getByText(offer.subject).click();
      await expect(page.getByRole("heading", { name: offer.subject })).toBeVisible();
      await recordPrints(page);
      await page.getByRole("button", { name: "Weitere Aktionen" }).click();
      await page.getByRole("menuitem", { name: "Drucken" }).click();
      await expect.poll(async () => (await printed(page)).length).toBe(1);

      // Head, text and attachments; nothing of the app (folders, buttons).
      const sheet = await (await browser.newContext()).newPage();
      await sheet.setContent((await printed(page))[0]!);
      await expect(sheet.getByRole("heading", { name: offer.subject })).toBeVisible();
      await expect(sheet.locator("table")).toContainText(
        "Petra Keller <petra.keller@keller-elektro.test>",
      );
      await expect(sheet.locator("body")).toContainText("Viele Grüße");
      await expect(sheet.locator(".files")).toContainText("Angebot-Wartung");
      await expect(sheet.locator("body")).not.toContainText("Posteingang");
      if (process.env.PRINT_PDF) await sheet.pdf({ path: process.env.PRINT_PDF, format: "A4" });

      // Ctrl+P prints the mail too, not the whole app; so does "p".
      await page.keyboard.press("Control+p");
      await expect.poll(async () => (await printed(page)).length).toBe(2);
      await page.keyboard.press("p");
      await expect.poll(async () => (await printed(page)).length).toBe(3);
    } finally {
      await offer.remove();
    }
  });

  test("druckt die Woche und den Monat des Kalenders", async ({ page, browser }) => {
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
      new Date(),
    );
    await login(page);
    await page.goto(`/calendar?view=week&date=${today}`);
    await expect(
      page.locator(`[data-day="${today}"]`).getByText("Baubesprechung Hoffmann"),
    ).toBeVisible();
    await recordPrints(page);
    await page.getByRole("button", { name: "Drucken" }).click();
    await expect.poll(async () => (await printed(page)).length).toBe(1);

    // The week: seven days, the event with its time and place; nothing of the app.
    const sheet = await (await browser.newContext()).newPage();
    await sheet.setContent((await printed(page))[0]!);
    await expect(sheet.locator("h1")).toBeVisible();
    await expect(sheet.locator(".day")).toHaveCount(7);
    const day = sheet.locator(`[data-day="${today}"]`);
    await expect(day).toContainText("10:00–11:00 Baubesprechung Hoffmann");
    await expect(day).toContainText("Hauptstraße 41, Bühl");
    await expect(sheet.locator("body")).not.toContainText("Neuer Termin");
    if (process.env.PRINT_PDF)
      await sheet.pdf({ path: process.env.PRINT_PDF, preferCSSPageSize: true });

    // The month by Ctrl+P: the title on the day, without the place.
    await page.goto(`/calendar?view=month&date=${today}`);
    await expect(page.locator(`[data-month-day="${today}"]`)).toContainText("Baubesprechung");
    await recordPrints(page);
    await page.keyboard.press("Control+p");
    await expect.poll(async () => (await printed(page)).length).toBe(1);
    await sheet.setContent((await printed(page))[0]!);
    await expect(sheet.locator(`[data-day="${today}"]`)).toContainText(
      "10:00 Baubesprechung Hoffmann",
    );
    await expect(sheet.locator("body")).not.toContainText("Hauptstraße 41");
  });
});
