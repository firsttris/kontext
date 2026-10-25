import { expect, test } from "@playwright/test";
import { login, unique } from "./helpers";
import { giveKey, PASSPHRASE } from "./pgp-key";

test.describe("Chat: vertrauliche Unterhaltung", () => {
  test("Ende-zu-Ende verschlüsselt: auf dem Server unlesbar, bei Max nach dem Entsperren", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const text = unique("Gehaltsgespräch am Freitag");
    await login(page, "anna");
    await giveKey(page, "anna");
    const max = await (await browser.newContext()).newPage();
    await login(max, "max");
    await giveKey(max, "max");

    await page.getByRole("link", { name: /^Chat/ }).first().click();
    await page.getByRole("button", { name: "Neue Nachricht" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Nachricht" });
    await dialog.getByText("Max Becker").click();
    await dialog.getByLabel(/Vertraulich – Ende-zu-Ende verschlüsselt/).check();
    await dialog.getByRole("button", { name: "Chat beginnen" }).click();
    await expect(page.getByRole("heading", { name: "Max Becker" })).toBeVisible();
    await expect(page.getByText("Vertraulich", { exact: true })).toBeVisible();

    // Writing needs the key open.
    await page.getByLabel("Passphrase deines Schlüssels").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Entsperren" }).click();
    await page.getByRole("textbox", { name: "Nachricht" }).fill(text);
    await page.keyboard.press("Enter");
    const list = page.getByRole("list", { name: "Nachrichten" });
    await expect(list).toContainText(text);

    // The server holds only cipher text.
    const channels = (await (await page.request.get("/api/chat/channels")).json()) as {
      channels: { id: string; confidential: boolean; last: { text: string } | null }[];
    };
    const channel = channels.channels.find((candidate) => candidate.confidential)!;
    await expect
      .poll(async () => {
        const stored = (await (
          await page.request.get(`/api/chat/channels/${channel.id}/messages`)
        ).json()) as { messages: { text: string }[] };
        return stored.messages[0]?.text ?? "";
      })
      .toMatch(/^-----BEGIN PGP MESSAGE-----/);
    const search = await page.request.get(`/api/chat/search?q=${encodeURIComponent("Gehalt")}`);
    expect(JSON.stringify(await search.json())).not.toContain(channel.id);

    await max.getByRole("link", { name: /^Chat/ }).first().click();
    const row = max
      .getByRole("navigation", { name: "Direktnachrichten" })
      .first()
      .getByRole("link", { name: /Anna Weber/ })
      .filter({ has: max.getByRole("img", { name: "Vertraulich" }) });
    await row.click();
    const theirs = max.getByRole("list", { name: "Nachrichten" });
    await expect(theirs).toContainText("Vertrauliche Nachricht – entsperre deinen Schlüssel");
    await max.getByLabel("Passphrase deines Schlüssels").fill(PASSPHRASE);
    await max.getByRole("button", { name: "Entsperren" }).click();
    await expect(theirs).toContainText(text);
    // An answer goes the same way, live to Anna.
    const answer = unique("Passt, 10 Uhr");
    await max.getByRole("textbox", { name: "Nachricht" }).fill(answer);
    await max.keyboard.press("Enter");
    await expect(list).toContainText(answer);
    await max.context().close();
  });
});
