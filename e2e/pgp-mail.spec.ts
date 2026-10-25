import { expect, type Page, test } from "@playwright/test";
import { encryptKey, generateKey, readPrivateKey } from "openpgp";
import { DEV_DOMAIN } from "../dev/config";
import { address, inboxSubjects, jmapAs, login, unique } from "./helpers";

const PASSPHRASE = "Im Keller steht die Pumpe";

/** A key for the signed-in person, set as Kontext keeps it; returns the public key. */
const giveKey = async (page: Page, user: string) => {
  const { privateKey, publicKey } = await generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ name: user, email: address(user) }],
    passphrase: PASSPHRASE,
    format: "armored",
  });
  const open = await readPrivateKey({ armoredKey: privateKey });
  const { decryptKey } = await import("openpgp");
  const recovery = await encryptKey({
    privateKey: await decryptKey({ privateKey: open, passphrase: PASSPHRASE }),
    passphrase: "CODE-CODE-CODE-CODE-CODE-CODE",
  });
  const response = await page.request.put("/api/pgp/me", {
    data: { publicKey, privateKey, recoveryKey: recovery.armor() },
  });
  expect(response.ok()).toBe(true);
  return publicKey;
};

test.describe("Verschlüsselung: PGP in Mails", () => {
  test("verschlüsselt senden, unterwegs unlesbar, beim Empfänger entschlüsselt und geprüft", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const subject = unique("Befund Wärmepumpe");
    await login(page, "anna");
    const max = await (await browser.newContext()).newPage();
    await login(max, "max");
    const annaKey = await giveKey(page, "anna");
    const maxKey = await giveKey(max, "max");
    await page.request.put("/api/pgp/keys", { data: { publicKey: maxKey, source: "import" } });
    await max.request.put("/api/pgp/keys", { data: { publicKey: annaKey, source: "import" } });

    await page.goto("/mail");
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill(address("max"));
    await page.keyboard.press(",");
    await page.getByLabel("Betreff").fill(subject);
    await page
      .getByRole("textbox", { name: "Ihre Nachricht …" })
      .fill("Messwerte: 42 Grad, alles vertraulich.");
    await page.getByRole("button", { name: "Verschlüsselt senden" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Verschlüsselt und unterschrieben" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    const unlock = page.getByRole("dialog", { name: "Entsperren" });
    await unlock.getByLabel("Passphrase deines Schlüssels").fill(PASSPHRASE);
    await unlock.getByRole("button", { name: "Entsperren" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Mail gesendet." })).toBeVisible();
    await expect.poll(() => inboxSubjects("max")).toContain(subject);

    // On the server only the encrypted text: the words are not in the mail.
    const client = jmapAs("max");
    const session = await client.getSession();
    const accountId = session.primaryAccounts["urn:ietf:params:jmap:mail"]!;
    const [found] = await client.request([
      ["Email/query", { accountId, filter: { text: "vertraulich" } }, "q"],
    ]);
    expect((found![1] as { ids: string[] }).ids).toHaveLength(0);

    await max.goto("/mail");
    const row = max
      .getByRole("list", { name: "Posteingang" })
      .getByRole("link", { name: new RegExp(subject) });
    await expect(row).toContainText("Verschlüsselt");
    await row.click();
    await expect(max.getByText("Verschlüsselt", { exact: true })).toBeVisible();
    await max.getByLabel("Passphrase deines Schlüssels").fill(PASSPHRASE);
    await max.getByRole("button", { name: "Entsperren" }).click();
    await expect(
      max.frameLocator("iframe[title='Inhalt der Mail']").getByText("Messwerte: 42 Grad"),
    ).toBeVisible();
    await expect(max.getByText(`Unterschrieben von anna@${DEV_DOMAIN} – geprüft`)).toBeVisible();
    // The answer goes encrypted too, without the cipher text quoted.
    await max.getByRole("link", { name: "Antworten" }).first().click();
    await expect(max.getByRole("button", { name: "Verschlüsselt senden" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(max.getByRole("textbox", { name: "Ihre Nachricht …" })).not.toContainText(
      "BEGIN PGP",
    );
    await max.context().close();
  });

  test("ohne Schlüssel des Empfängers bleibt der Schalter gesperrt", async ({ page }) => {
    await login(page, "sandra");
    await giveKey(page, "sandra");
    await page.goto("/mail");
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill("niemand@example.test");
    await page.keyboard.press(",");
    await page.getByRole("button", { name: "Verschlüsselt senden" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Kein Schlüssel für niemand@example.test" }),
    ).toBeVisible();
  });
});
