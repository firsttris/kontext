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
    // A week is enough here (30 days are the usual).
    const days = page.getByRole("combobox", { name: "Wie lange der Link gilt" });
    await expect(days).toHaveValue("30");
    await days.selectOption({ label: "Link 7 Tage gültig" });
    await page.getByRole("button", { name: "Senden", exact: true }).click();

    const codes = page.getByRole("dialog", { name: "Zugangscodes" });
    const code = (await codes.getByRole("status", { name: `Code für ${customer}` }).textContent())!;
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await codes.getByRole("button", { name: "Weitergegeben" }).click();

    let link: string | undefined;
    await expect.poll(async () => (link = await sentLink("jonas", customer))).toBeTruthy();
    // Only encrypted on the server: the amount is in no mail.
    expect(link).not.toContain("2.340");
    const listed = (await (await page.request.get("/api/secure")).json()) as {
      messages: { to: string; createdAt: string; expiresAt: string }[];
    };
    const sent = listed.messages.find((message) => message.to === customer)!;
    const lifetime = Date.parse(sent.expiresAt) - Date.parse(sent.createdAt);
    expect(Math.round(lifetime / 86_400_000)).toBe(7);

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

/** A red 60 × 40 PNG, for a picture in the text. */
const RED_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAADwAAAAoCAIAAAAt2Q6oAAAAO0lEQVR42u3OQQkAAAgEsEtz/QMZxhQ+hMECLNO+E2lpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlp6UsL/qHXl2FUdv0AAAAASUVORK5CYII=";

test.describe("Vertraulich senden mit Bild", () => {
  test("ein Bild im Text geht nur verschlüsselt mit, nicht in die Mail mit dem Link", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const subject = unique("Schadensfoto");
    const customer = `kunde-bild-${Date.now()}@example.test`;
    await login(page);
    await giveKey(page, "jonas");
    await page.goto("/mail");
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill(customer);
    await page.keyboard.press(",");
    await page.getByLabel("Betreff").fill(subject);
    await page.getByRole("button", { name: "Vertraulich senden" }).click();
    await expect(page.getByRole("status").filter({ hasText: "per Link mit Code" })).toBeVisible();
    const body = page.getByRole("textbox", { name: "Ihre Nachricht …" });
    await body.click();
    await page.keyboard.type("Der Schaden:");
    await page.keyboard.press("Enter");
    await page.locator('input[type="file"][accept^="image/png"]').setInputFiles({
      name: "schaden.png",
      mimeType: "image/png",
      buffer: Buffer.from(RED_PNG, "base64"),
    });
    await expect(body.locator('img[alt="schaden.png"]')).toHaveCount(1);
    await page.getByRole("button", { name: "Senden", exact: true }).click();

    // The link went out; the mail that brings it carries no picture of the confidential one.
    const codes = page.getByRole("dialog", { name: "Zugangscodes" });
    await expect(codes.getByRole("status", { name: `Code für ${customer}` })).toBeVisible();
    await codes.getByRole("button", { name: "Weitergegeben" }).click();
    await expect.poll(() => sentLink("jonas", customer)).toBeTruthy();
    const client = jmapAs("jonas");
    const session = await client.getSession();
    const accountId = session.primaryAccounts["urn:ietf:params:jmap:mail"]!;
    const [, got] = await client.request([
      ["Email/query", { accountId, filter: { to: customer }, limit: 1 }, "q"],
      [
        "Email/get",
        {
          accountId,
          "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
          properties: ["attachments", "hasAttachment"],
        },
        "g",
      ],
    ]);
    const mail = (got![1] as { list: { attachments: unknown[] }[] }).list[0];
    expect(mail?.attachments ?? []).toEqual([]);
  });
});

test.describe("Vertraulich senden: Dateien im Browser", () => {
  test("mehrere Dateien auf einmal halten zusammen die Grenze ein", async ({ page }) => {
    test.setTimeout(90_000);
    await login(page);
    await giveKey(page, "jonas");
    await page.goto("/mail");
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill(`kunde-gross-${Date.now()}@example.test`);
    await page.keyboard.press(",");
    await page.getByLabel("Betreff").fill(unique("Pläne"));
    await page.getByRole("button", { name: "Vertraulich senden" }).click();
    await expect(page.getByRole("status").filter({ hasText: "per Link mit Code" })).toBeVisible();
    // Two files of 15 MB, chosen together: each fits, both together do not (25 MB).
    const big = Buffer.alloc(15 * 1024 * 1024, 1);
    await page.locator('form input[type="file"][multiple]:not([accept])').setInputFiles([
      { name: "plan-eg.pdf", mimeType: "application/pdf", buffer: big },
      { name: "plan-og.pdf", mimeType: "application/pdf", buffer: big },
    ]);
    await expect(page.getByText(/bis zusammen 25 MB mit/)).toBeVisible();
    await expect(page.getByText("plan-eg.pdf")).toBeVisible();
    await expect(page.getByText("plan-og.pdf")).toHaveCount(0);
  });

  test("„Als Entwurf speichern“ meldet bei Vertraulich nichts Gespeichertes", async ({ page }) => {
    test.setTimeout(90_000);
    const subject = unique("Vertrag Entwurf");
    await login(page);
    await giveKey(page, "jonas");
    await page.goto("/mail");
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page
      .getByRole("combobox", { name: "An" })
      .fill(`kunde-entwurf-${Date.now()}@example.test`);
    await page.keyboard.press(",");
    await page.getByLabel("Betreff").fill(subject);
    await page.getByRole("textbox", { name: "Ihre Nachricht …" }).fill("Der Vertrag, Entwurf 3.");
    await expect(page.getByText(/Entwurf gespeichert um/)).toBeVisible({ timeout: 10_000 });
    // On: the plain draft goes; an encrypted mail is kept nowhere on the server.
    await page.getByRole("button", { name: "Vertraulich senden" }).click();
    await expect(page.getByRole("status").filter({ hasText: "per Link mit Code" })).toBeVisible();
    await page.getByRole("button", { name: "Als Entwurf speichern" }).click();
    // Nothing was saved, so it must not say so and close the mail: it would be lost.
    await page.waitForTimeout(1000);
    await expect(page.getByRole("status").filter({ hasText: "Entwurf gespeichert." })).toHaveCount(
      0,
    );
    await expect(page.getByLabel("Betreff")).toHaveValue(subject);
  });
});
