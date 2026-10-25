import { expect, test } from "@playwright/test";
import { DEV_DOMAIN } from "../dev/config";
import { address, inboxSubjects, jmapAs, login, unique } from "./helpers";
import { giveKey, PASSPHRASE } from "./pgp-key";

const STAND_IN = "Vertrauliche Nachricht";

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
    await page
      .locator('form input[type="file"][multiple]')
      .setInputFiles({
        name: "messung.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("Grad;42\n"),
      });
    await expect(page.getByText("messung.csv")).toBeVisible();
    await page.getByRole("button", { name: "Vertraulich senden" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Verschlüsselt und unterschrieben" }),
    ).toBeVisible();
    const before = (await inboxSubjects("max")).filter((s) => s === STAND_IN).length;
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    const unlock = page.getByRole("dialog", { name: "Entsperren" });
    await unlock.getByLabel("Passphrase deines Schlüssels").fill(PASSPHRASE);
    await unlock.getByRole("button", { name: "Entsperren" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Mail gesendet." })).toBeVisible();
    // The subject went inside; outside it says "Vertrauliche Nachricht" (Protected Headers).
    await expect
      .poll(async () => (await inboxSubjects("max")).filter((s) => s === STAND_IN).length)
      .toBe(before + 1);
    expect(await inboxSubjects("max")).not.toContain(subject);

    // On the server only the encrypted text: the words are not in the mail.
    const client = jmapAs("max");
    const session = await client.getSession();
    const accountId = session.primaryAccounts["urn:ietf:params:jmap:mail"]!;
    const [found] = await client.request([
      ["Email/query", { accountId, filter: { text: "Messwerte" } }, "q"],
    ]);
    expect((found![1] as { ids: string[] }).ids).toHaveLength(0);

    await max.goto("/mail");
    const row = max
      .getByRole("list", { name: "Posteingang" })
      .getByRole("link", { name: new RegExp(STAND_IN) })
      .first();
    await expect(row).toContainText("Verschlüsselt");
    await row.click();
    const list = max.getByRole("list", { name: "Posteingang" });
    await expect(
      max.getByRole("article").getByText("Verschlüsselt", { exact: true }),
    ).toBeVisible();
    await max.getByLabel("Passphrase deines Schlüssels").fill(PASSPHRASE);
    await max.getByRole("button", { name: "Entsperren" }).click();
    await expect(
      max.frameLocator("iframe[title='Inhalt der Mail']").getByText("Messwerte: 42 Grad"),
    ).toBeVisible();
    await expect(max.getByText(`Unterschrieben von anna@${DEV_DOMAIN} – geprüft`)).toBeVisible();
    // Opened, the real subject shows in the mail and in the list.
    await expect(max.getByRole("heading", { name: subject })).toBeVisible();
    await expect(list).toContainText(subject);
    // The list shows the opened text instead of cipher text.
    await expect(list).toContainText("Messwerte: 42 Grad");
    // The answer goes encrypted too, quoting the opened text, never the cipher text.
    await max.getByRole("link", { name: "Antworten" }).first().click();
    await expect(max.getByRole("button", { name: "Vertraulich senden" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const editor = max.getByRole("textbox", { name: "Ihre Nachricht …" });
    await expect(editor).toContainText("Messwerte: 42 Grad");
    await expect(editor).not.toContainText("BEGIN PGP");
    await expect(max.getByRole("textbox", { name: "Betreff" })).toHaveValue(`Re: ${subject}`);
    await max.getByRole("button", { name: "Verwerfen" }).click();
    // Forwarding takes the opened content and its file, not the encrypted parts.
    await max.getByRole("link", { name: "Weiterleiten" }).first().click();
    await expect(editor).toContainText("Messwerte: 42 Grad");
    await expect(max.getByText("messung.csv")).toBeVisible();
    await expect(max.getByText("encrypted.asc")).toHaveCount(0);
    await max.context().close();
  });

  test("ohne Schlüssel des Empfängers geht es per Link", async ({ page }) => {
    await login(page, "sandra");
    await giveKey(page, "sandra");
    await page.goto("/mail");
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill("niemand@example.test");
    await page.keyboard.press(",");
    await page.getByRole("button", { name: "Vertraulich senden" }).click();
    await expect(page.getByRole("status").filter({ hasText: "per Link mit Code" })).toBeVisible();
  });
});
