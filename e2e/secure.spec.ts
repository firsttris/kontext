import { expect, type Page, test } from "@playwright/test";
import { decryptKey, encryptKey, generateKey, readPrivateKey } from "openpgp";
import { address, jmapAs, login, unique } from "./helpers";

const PASSPHRASE = "Im Keller steht die Pumpe";

const giveKey = async (page: Page, user: string) => {
  const { privateKey, publicKey } = await generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ name: user, email: address(user) }],
    passphrase: PASSPHRASE,
    format: "armored",
  });
  const recovery = await encryptKey({
    privateKey: await decryptKey({
      privateKey: await readPrivateKey({ armoredKey: privateKey }),
      passphrase: PASSPHRASE,
    }),
    passphrase: "CODECODECODECODE",
  });
  const response = await page.request.put("/api/pgp/me", {
    data: { publicKey, privateKey, recoveryKey: recovery.armor() },
  });
  expect(response.ok()).toBe(true);
};

/** The link in the mail that went out, from the sender's Sent folder. */
const sentLink = async (user: string, to: string) => {
  const client = jmapAs(user);
  const session = await client.getSession();
  const accountId = session.primaryAccounts["urn:ietf:params:jmap:mail"]!;
  const [, got] = await client.request([
    [
      "Email/query",
      {
        accountId,
        filter: { to },
        sort: [{ property: "receivedAt", isAscending: false }],
        limit: 1,
      },
      "q",
    ],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: ["textBody", "bodyValues"],
        fetchTextBodyValues: true,
      },
      "g",
    ],
  ]);
  const mail = (got![1] as { list: { bodyValues: Record<string, { value: string }> }[] }).list[0];
  return Object.values(mail?.bodyValues ?? {})
    .map((part) => part.value)
    .join("\n")
    .match(/https?:\/\/\S+\/s\/\S+#\S+/)?.[0];
};

test.describe("Vertraulich senden", () => {
  test("per Link mit Code: öffnen, falscher Code zählt, antworten, Absender liest die Antwort", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const subject = unique("Lohnabrechnung Oktober");
    const customer = `kunde-${Date.now()}@example.test`;
    await login(page);
    await giveKey(page, "jonas");
    await page.goto("/mail");
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill(customer);
    await page.keyboard.press(",");
    await page.getByLabel("Betreff").fill(subject);
    await page
      .getByRole("textbox", { name: "Ihre Nachricht …" })
      .fill("Ihre Abrechnung: 2.340 € netto.");
    await page.getByRole("button", { name: "Vertraulich senden" }).click();
    await expect(page.getByRole("status").filter({ hasText: "per Link mit Code" })).toBeVisible();
    await page.getByRole("button", { name: "Senden", exact: true }).click();

    const codes = page.getByRole("dialog", { name: "Zugangscodes" });
    const code = (await codes.getByRole("status", { name: `Code für ${customer}` }).textContent())!;
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await codes.getByRole("button", { name: "Weitergegeben" }).click();

    let link: string | undefined;
    await expect.poll(async () => (link = await sentLink("jonas", customer))).toBeTruthy();
    // Only encrypted on the server: the amount is in no mail.
    expect(link).not.toContain("2.340");

    const outside = await (await browser.newContext()).newPage();
    await outside.goto(link!);
    await expect(outside.getByRole("heading", { name: "Vertrauliche Nachricht" })).toBeVisible();
    await outside.getByLabel("Zugangscode").fill("AAAA-AAAA");
    await outside.getByRole("button", { name: "Öffnen" }).click();
    await expect(outside.getByRole("alert")).toHaveText("Der Code stimmt nicht. Noch 4 Versuche.");
    await outside.getByLabel("Zugangscode").fill(code.toLowerCase());
    await outside.getByRole("button", { name: "Öffnen" }).click();
    await expect(outside.getByRole("heading", { name: subject })).toBeVisible();
    await expect(
      outside.frameLocator("iframe[title='Inhalt der Mail']").getByText("2.340 € netto"),
    ).toBeVisible();
    await outside.getByLabel("Ihre Antwort").fill("Danke, passt so.");
    await outside.getByRole("button", { name: "Vertraulich antworten" }).click();
    await expect(outside.getByRole("region", { name: "Antworten" })).toContainText(
      "Danke, passt so.",
    );
    await outside.context().close();

    // The sender: the answer in "Vertraulich gesendet", read with the own key.
    await page.goto("/secure");
    const entry = page.getByRole("link", { name: new RegExp(customer) });
    await expect(entry).toContainText("1 neu");
    await entry.click();
    await page.getByLabel("Passphrase deines Schlüssels").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Entsperren" }).click();
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
    await expect(page.getByRole("region", { name: "Antworten" })).toContainText("Danke, passt so.");
  });
});
