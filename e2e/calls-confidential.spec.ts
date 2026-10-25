import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";
import { giveKey, PASSPHRASE } from "./pgp-key";

/** The confidential conversation with this person, opened, with one's key unlocked. */
const openConfidential = async (page: Page, name: string, start: boolean) => {
  await page.getByRole("link", { name: /^Chat/ }).first().click();
  if (start) {
    await page.getByRole("button", { name: "Neue Nachricht" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Nachricht" });
    await dialog.getByText(name).click();
    await dialog.getByLabel(/Vertraulich – Ende-zu-Ende verschlüsselt/).check();
    await dialog.getByRole("button", { name: "Chat beginnen" }).click();
  } else {
    await page
      .getByRole("navigation", { name: "Direktnachrichten" })
      .first()
      .getByRole("link", { name: new RegExp(name) })
      .filter({ has: page.getByRole("img", { name: "Vertraulich" }) })
      .click();
  }
  await page.getByLabel("Passphrase deines Schlüssels").fill(PASSPHRASE);
  await page.getByRole("button", { name: "Entsperren" }).click();
  await expect(page.getByRole("textbox", { name: "Nachricht" })).toBeVisible();
};

const callPanel = (page: Page) => page.getByRole("region", { name: /^Gespräch:/ });

test.describe("Anrufe: vertraulich", () => {
  test("in einer vertraulichen Unterhaltung Ende-zu-Ende verschlüsselt, beide hören sich", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    await login(page, "anna");
    await giveKey(page, "anna");
    const context = await browser.newContext();
    const max = await context.newPage();
    await login(max, "max");
    await giveKey(max, "max");
    await openConfidential(page, "Max Becker", true);
    await openConfidential(max, "Anna Weber", false);

    await page.getByRole("button", { name: "Anrufen", exact: true }).click();
    const panel = callPanel(page);
    await expect(panel.getByText("Ende-zu-Ende verschlüsselt")).toBeVisible({ timeout: 15_000 });
    const ringing = max.getByRole("dialog", { name: "Anna Weber ruft an" });
    await ringing.getByRole("button", { name: "Annehmen", exact: true }).click();
    const maxPanel = callPanel(max);
    await expect(maxPanel.getByText("Ende-zu-Ende verschlüsselt")).toBeVisible({
      timeout: 15_000,
    });
    // Both use the one key: the call connects and runs.
    await expect(panel.getByRole("status")).toHaveText(/^\d+:\d\d$/, { timeout: 15_000 });
    await expect(maxPanel.getByRole("listitem", { name: /^Anna Weber/ })).toBeVisible();
    await panel.getByRole("button", { name: "Auflegen" }).click();
    await expect(maxPanel).toHaveCount(0, { timeout: 15_000 });
    await context.close();
  });
});
