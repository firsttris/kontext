import { expect, test } from "@playwright/test";
import { login, unique } from "./helpers";
import { printed, recordPrints } from "./printed";
import { newsletter, pictureServer, removeNewsletter } from "./remote-pictures";

test.describe("Drucken", () => {
  test("druckt die offene Mail ohne die App drumherum", async ({ page, browser }) => {
    await login(page);
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Angebot Wartungsvertrag 2027")
      .click();
    await expect(page.getByRole("heading", { name: "Angebot Wartungsvertrag 2027" })).toBeVisible();
    await recordPrints(page);
    await page.getByRole("button", { name: "Weitere Aktionen" }).click();
    await page.getByRole("menuitem", { name: "Drucken" }).click();
    await expect.poll(async () => (await printed(page)).length).toBe(1);

    // Head, text and attachments; nothing of the app (folders, buttons).
    const sheet = await (await browser.newContext()).newPage();
    await sheet.setContent((await printed(page))[0]!);
    await expect(
      sheet.getByRole("heading", { name: "Angebot Wartungsvertrag 2027" }),
    ).toBeVisible();
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
  });

  test("druckt Bilder aus dem Internet nur, wenn sie in der Mail geladen wurden", async ({
    page,
  }) => {
    const pictures = await pictureServer();
    const subject = unique("Frühjahrsaktion");
    const id = await newsletter(subject, pictures.url);
    try {
      await login(page, "max");
      await page.goto("/mail");
      await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
      await expect(page.getByText("Bilder aus dem Internet sind blockiert.")).toBeVisible();
      await recordPrints(page);

      // Blocked on screen: blocked on paper, by the page's CSP as well.
      await page.keyboard.press("p");
      await expect.poll(async () => (await printed(page)).length).toBe(1);
      const blocked = (await printed(page))[0]!;
      expect(blocked).not.toContain(pictures.url);
      expect(blocked).toContain("img-src data: blob:;");

      // Loaded for this mail: on paper too, and still nothing but images from outside.
      await page.getByRole("button", { name: "Laden", exact: true }).click();
      await expect.poll(pictures.hits).toBeGreaterThan(0);
      await page.keyboard.press("p");
      await expect.poll(async () => (await printed(page)).length).toBe(2);
      const allowed = (await printed(page))[1]!;
      expect(allowed).toContain(`src="${pictures.url}"`);
      expect(allowed).toContain("img-src data: blob: https: http:;");
      expect(allowed).toContain("default-src 'none'; style-src 'unsafe-inline';");
    } finally {
      await removeNewsletter(id);
      pictures.close();
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
