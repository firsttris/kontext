import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

/** The pictures in the README and the docs. Run with `bun run screenshots`. */
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `docs/screenshots/${name}.png`, animations: "disabled" });

/** The open mail is drawn: its text, and the thumbnails of its attachments (pdf.js takes a moment). */
const mailShown = async (page: Page) => {
  await expect(page.frameLocator("iframe").getByText("Viele Grüße")).toBeVisible();
  const attachments = page.getByRole("list", { name: "Anhänge" });
  if (await attachments.count()) await expect(attachments.locator("img").first()).toBeVisible();
};

const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

test.describe("Screenshots @screenshots", () => {
  test("Desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Angebot Wartungsvertrag 2027")
      .click();
    await mailShown(page);
    await shot(page, "mail");

    await page.getByRole("link", { name: /Antworten an Petra/ }).click();
    await expect(page.getByLabel("Betreff")).toHaveValue(/Re:/);
    await shot(page, "compose");

    await page.getByRole("link", { name: "info@" }).click();
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Anfrage Wärmepumpe Neubau")
      .click();
    await mailShown(page);
    await shot(page, "shared-mailbox");

    await page.goto("/calendar");
    await expect(
      page.locator(`[data-day="${today()}"]`).getByText("Baubesprechung Hoffmann"),
    ).toBeVisible();
    await shot(page, "calendar");

    await page.goto("/contacts");
    await page.getByRole("link", { name: /Markus Hoffmann/ }).click();
    await expect(page.getByText("Re: Badsanierung Obergeschoss")).toBeVisible();
    await shot(page, "contacts");
  });

  test("Dunkel", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: "dark",
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
    });
    const page = await context.newPage();
    await login(page);
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Angebot Wartungsvertrag 2027")
      .click();
    await mailShown(page);
    await shot(page, "mail-dark");
    await page.goto("/calendar");
    await expect(
      page.locator(`[data-day="${today()}"]`).getByText("Baubesprechung Hoffmann"),
    ).toBeVisible();
    await shot(page, "calendar-dark");
    await context.close();
  });

  test("Handy", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
    });
    const page = await context.newPage();
    await login(page);
    await expect(page.getByText("Angebot Wartungsvertrag 2027")).toBeVisible();
    await shot(page, "phone-mail");
    await page.getByText("Angebot Wartungsvertrag 2027").click();
    await mailShown(page);
    await shot(page, "phone-read");
    await page.goto("/calendar");
    await expect(page.getByText("Baubesprechung Hoffmann")).toBeVisible();
    await shot(page, "phone-calendar");
    await context.close();
  });
});
