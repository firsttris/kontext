import { type Browser, expect, type Page, test } from "@playwright/test";
import { DEV_PASSWORD } from "../dev/config";
import { address, login } from "./helpers";

/** Edge on ChromeOS: a browser no other test signs in with, so its rows are this test's. */
const OTHER_BROWSER =
  "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";

/** A second browser signed in with the form: a session of its own. */
const secondBrowser = async (browser: Browser, user: string): Promise<Page> => {
  const context = await browser.newContext({ userAgent: OTHER_BROWSER, locale: "de-DE" });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill(address(user));
  await page.getByLabel("Passwort").fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/mail\//);
  return page;
};

const devices = (page: Page) => page.getByRole("list", { name: "Angemeldete Browser" });

test.describe("Zugänge", () => {
  test("zeigt die angemeldeten Browser und meldet einen anderen ab", async ({ page, browser }) => {
    const other = await secondBrowser(browser, "max");
    await login(page, "max");
    await page.goto("/settings?section=access");
    await expect(devices(page).getByText("Dieses Gerät")).toHaveCount(1);
    const rows = devices(page).getByRole("listitem").filter({ hasText: "Edge auf ChromeOS" });
    await expect(rows.first()).toBeVisible();
    // This browser has no "Abmelden" here; it signs out with the menu.
    await expect(
      devices(page)
        .getByRole("listitem")
        .filter({ hasText: "Dieses Gerät" })
        .getByRole("button", { name: "Abmelden" }),
    ).toHaveCount(0);

    // Every row of the other browser (a retry may have left one), until none is left.
    for (let left = await rows.count(); left > 0; left--) {
      await rows.first().getByRole("button", { name: "Abmelden" }).click();
      await rows.first().getByRole("button", { name: "Ja, weiter" }).click();
      await expect(rows).toHaveCount(left - 1);
    }
    expect((await other.context().request.get("/jmap/session")).status()).toBe(401);
    await other.reload();
    await expect(other).toHaveURL(/\/login/);
    // This one stays signed in.
    expect((await page.context().request.get("/jmap/session")).ok()).toBe(true);
  });

  test("führt zu App-Passwörtern und Agenten", async ({ page }) => {
    await login(page, "max");
    await page.goto("/settings?section=access");
    for (const title of ["App-Passwörter", "KI-Agenten", "Andere Programme"]) {
      await expect(page.getByRole("region", { name: title })).toBeVisible();
    }
    await page
      .getByRole("region", { name: "App-Passwörter" })
      .getByRole("link", { name: "Verwalten" })
      .click();
    await expect(page).toHaveURL(/section=sync/);
  });
});

test.describe("Zugänge am Handy @phone", () => {
  test("listet dieses Gerät ohne seitliches Scrollen @phone", async ({ page }) => {
    await login(page, "sandra");
    await page.goto("/settings?section=access");
    await expect(devices(page).getByText("Dieses Gerät")).toBeVisible();
    const width = page.viewportSize()?.width ?? 0;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
});
