import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * The page handed to the browser's print dialog. Headless Chromium prints at once and the hidden
 * frame is gone right after, so its content is recorded when it is added.
 */
const recordPrints = (page: Page) =>
  page.evaluate(() => {
    const record = window as unknown as { printed: string[] };
    record.printed = [];
    new MutationObserver((changes) => {
      for (const change of changes)
        for (const node of change.addedNodes)
          if (node instanceof HTMLIFrameElement && node.getAttribute("aria-hidden") === "true")
            record.printed.push(node.srcdoc);
    }).observe(document.body, { childList: true });
  });

const printed = (page: Page) =>
  page.evaluate(() => (window as unknown as { printed: string[] }).printed);

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
});
