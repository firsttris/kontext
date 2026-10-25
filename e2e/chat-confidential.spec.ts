import { expect, test } from "@playwright/test";
import { login, unique } from "./helpers";
import { giveKey, PASSPHRASE } from "./pgp-key";

/** A picture of one pixel. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

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
        ).json()) as { messages: { text: string; call: unknown }[] };
        // The newest written message (a call line from another test has no text).
        return stored.messages.find((message) => !message.call)?.text ?? "";
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
    // Photos and files go encrypted too: on the server without name, at Max opened.
    await page.locator('input[type="file"][multiple]').setInputFiles([
      { name: "lohn.png", mimeType: "image/png", buffer: PNG },
      {
        name: "vertrag.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
      },
    ]);
    const tray = page.getByRole("region", { name: "Angehängt" });
    await expect(tray.getByRole("status")).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(tray).toHaveCount(0);
    const photo = max.getByRole("button", { name: "Foto lohn.png groß zeigen" }).locator("img");
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
    const pdf = max.getByRole("link", { name: /vertrag\.pdf/ });
    await expect(pdf).toHaveAttribute("href", /^blob:/);
    const stored = (await (
      await page.request.get(`/api/chat/channels/${channel.id}/messages`)
    ).json()) as { messages: { files: { id: string; name: string }[] }[] };
    const files = stored.messages[0]!.files;
    expect(files.map((file) => file.name)).toEqual(["verschlüsselt", "verschlüsselt"]);
    const raw = await page.request.get(`/api/chat/files/${files[1]!.id}`);
    expect((await raw.body()).toString("latin1")).not.toContain("%PDF");

    // An answer goes the same way, live to Anna.
    const answer = unique("Passt, 10 Uhr");
    await max.getByRole("textbox", { name: "Nachricht" }).fill(answer);
    await max.keyboard.press("Enter");
    await expect(list).toContainText(answer);
    await max.context().close();
  });

  test("ein neuer Schlüssel eines Mitglieds fällt auf und wird erst nach Bestätigung angenommen", async ({
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

    await page.getByRole("link", { name: /^Chat/ }).first().click();
    await page.getByRole("button", { name: "Neue Nachricht" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Nachricht" });
    await dialog.getByText("Max Becker").click();
    await dialog.getByLabel(/Vertraulich – Ende-zu-Ende verschlüsselt/).check();
    await dialog.getByRole("button", { name: "Chat beginnen" }).click();
    await expect(page.getByRole("heading", { name: "Max Becker" })).toBeVisible();
    const changed = page.getByRole("alert").filter({ hasText: "hat einen neuen Schlüssel" });
    // Known from before (another test gave Max a key): confirm that one first.
    if (await changed.isVisible().catch(() => false)) {
      await changed.getByRole("button", { name: "Neuen Schlüssel bestätigen" }).click();
    }
    await expect(changed).toHaveCount(0);
    const url = page.url();

    // Max makes a new key: Anna sees it the next time she opens the conversation.
    await giveKey(max, "max");
    await page.goto(url);
    await expect(changed).toContainText("Max Becker hat einen neuen Schlüssel");
    await expect(changed).toContainText(/([0-9A-F]{4} ){9}[0-9A-F]{4}/);
    await changed.getByRole("button", { name: "Neuen Schlüssel bestätigen" }).click();
    await expect(changed).toHaveCount(0);
    await page.goto("/settings?section=encryption");
    await expect(page.getByRole("region", { name: "Schlüssel von anderen" })).toContainText(
      "Ein anderer Schlüssel als vorher",
    );
    await context.close();
  });

  test("eine Unterhaltung vertraulich weiterführen: neue verschlüsselte, Hinweis in der alten", async ({
    page,
    browser,
  }) => {
    await login(page, "anna");
    await giveKey(page, "anna");
    const context = await browser.newContext();
    const max = await context.newPage();
    await login(max, "max");
    await giveKey(max, "max");
    await context.close();
    await page.getByRole("link", { name: /^Chat/ }).first().click();
    await page.getByRole("button", { name: "Neue Nachricht" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Nachricht" });
    await dialog.getByText("Max Becker").click();
    await dialog.getByRole("button", { name: "Chat beginnen" }).click();
    await expect(page.getByRole("heading", { name: "Max Becker" })).toBeVisible();
    await expect(page.getByText("Vertraulich", { exact: true })).toHaveCount(0);
    const plain = new URL(page.url()).searchParams.get("channel");

    page.once("dialog", (question) => void question.accept());
    await page.getByRole("button", { name: "Mehr zum Kanal" }).click();
    await page.getByRole("menuitem", { name: "Vertraulich weiterführen" }).click();
    await expect(page.getByText("Vertraulich", { exact: true })).toBeVisible();
    const confidential = new URL(page.url()).searchParams.get("channel");
    expect(confidential).not.toBe(plain);

    // The old conversation says where it goes on, with a link only members can open.
    await page.goto(`/chat?channel=${plain}`);
    const note = page
      .getByRole("list", { name: "Nachrichten" })
      .getByRole("paragraph")
      .filter({ hasText: "Weiter geht es vertraulich" })
      .last();
    await expect(note).toBeVisible();
    await expect(note.getByRole("link")).toHaveAttribute(
      "href",
      new RegExp(`channel=${confidential}`),
    );
  });
});
