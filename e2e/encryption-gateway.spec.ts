import { expect, type Page, test } from "@playwright/test";
import { generateKey } from "openpgp";
import { login, unique } from "./helpers";

const SWITCH = "Mails an Empfänger mit bekanntem Schlüssel automatisch verschlüsseln";

/** Leaves Stalwart's gateway off again, as the other tests expect it. */
const switchOff = (page: Page) =>
  page.evaluate(async () => {
    await fetch("/api/company/encryption-gateway", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
  });

test.describe("Firmenverwaltung: beim Versand verschlüsseln", () => {
  test("schaltet das Verschlüsseln ein und nimmt einen eingefügten Schlüssel auf", async ({
    page,
  }) => {
    const email = `${unique("steuer").replace(/\W+/g, "-").toLowerCase()}@kanzlei.test`;
    const { publicKey } = await generateKey({
      type: "ecc",
      curve: "curve25519Legacy",
      userIDs: [{ name: "Kanzlei", email }],
      format: "armored",
    });
    await login(page);
    await page.goto("/settings?section=company-security");
    const card = page.getByRole("region", { name: "Beim Versand verschlüsseln" });
    try {
      const toggle = card.getByRole("switch", { name: SWITCH });
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await page.reload();
      await expect(card.getByRole("switch", { name: SWITCH })).toHaveAttribute(
        "aria-checked",
        "true",
      );

      await card.getByLabel("Adresse des Empfängers").fill(email);
      await card.getByLabel(/Öffentlicher Schlüssel/).fill(publicKey);
      await card.getByRole("button", { name: "Schlüssel hinzufügen" }).click();
      const row = card.getByRole("list", { name: "Schlüssel der Empfänger" }).getByRole("listitem");
      await expect(row.filter({ hasText: email })).toContainText("Eingefügt");

      page.once("dialog", (dialog) => void dialog.accept());
      await card.getByRole("button", { name: `Schlüssel von ${email} entfernen` }).click();
      await expect(row.filter({ hasText: email })).toHaveCount(0);
    } finally {
      await switchOff(page);
    }
  });
});

test.describe("Beim Versand verschlüsseln am Handy @phone", () => {
  test("zeigt Schalter und Eingabe ohne seitliches Scrollen @phone", async ({ page }) => {
    await login(page);
    await page.goto("/settings?section=company-security");
    const card = page.getByRole("region", { name: "Beim Versand verschlüsseln" });
    await expect(card.getByRole("switch", { name: SWITCH })).toBeVisible();
    await expect(card.getByLabel("Adresse des Empfängers")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
