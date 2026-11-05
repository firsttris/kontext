import { expect, type Page, test } from "@playwright/test";
import { setEncryptionAtRest } from "../src/jmap/encryption-at-rest";
import { address, jmapAs, login, rawInboxMail, unique } from "./helpers";
import { giveKey, PASSPHRASE } from "./pgp-key";

const SWITCH = "Mails auf dem Server verschlüsselt ablegen";

const switchOn = async (page: Page) => {
  await page.goto("/settings?section=encryption");
  const on = page.getByRole("switch", { name: SWITCH });
  await on.click();
  await expect(on).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("status").filter({ hasText: "verschlüsselt abgelegt" }),
  ).toBeVisible();
  return on;
};

test.describe("Verschlüsselung: Mails auf dem Server verschlüsselt", () => {
  // Off again, whatever happened: other tests read Sandra's mails.
  test.afterEach(() => setEncryptionAtRest(jmapAs("sandra"), { "@type": "Disabled" }));

  test("neue Mails liegen verschlüsselt, Kontext öffnet sie mit dem eigenen Schlüssel", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await login(page, "sandra");
    await giveKey(page, "sandra");
    await switchOn(page);
    await expect(page.getByRole("switch", { name: /Mailprogramme oder ein Import/ })).toBeVisible();

    const subject = unique("Zählerstand");
    await page.goto("/mail");
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill(address("sandra"));
    await page.keyboard.press(",");
    await page.getByLabel("Betreff").fill(subject);
    await page
      .getByRole("textbox", { name: "Ihre Nachricht …" })
      .fill("Zähler 4711 steht bei 815.");
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Mail gesendet." })).toBeVisible();

    // On the server: Stalwart's PGP/MIME, the subject outside, the words only inside.
    await expect
      .poll(() => rawInboxMail("sandra", subject).catch(() => ""), { timeout: 30_000 })
      .toContain("multipart/encrypted");
    const raw = await rawInboxMail("sandra", subject);
    expect(raw).not.toContain("Zähler 4711");

    await page.goto("/mail");
    await page.getByRole("list", { name: "Posteingang" }).getByText(subject).first().click();
    await page.getByLabel("Passphrase deines Schlüssels").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Entsperren" }).click();
    await expect(
      page.frameLocator("iframe[title='Inhalt der Mail']").getByText("Zähler 4711 steht bei 815."),
    ).toBeVisible();

    await page.goto("/settings?section=encryption");
    const on = page.getByRole("switch", { name: SWITCH });
    await expect(on).toHaveAttribute("aria-checked", "true");
    await on.click();
    await expect(on).toHaveAttribute("aria-checked", "false");
  });

  test("lässt sich am Handy einschalten @phone", async ({ page }) => {
    await login(page, "sandra");
    await giveKey(page, "sandra");
    await switchOn(page);
    await page.reload();
    await expect(page.getByRole("switch", { name: SWITCH })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
