import { expect, test } from "@playwright/test";
import { colleague, messageIn, newChannel, openChannel, write } from "./chat-helpers";
import { login, longPress, unique } from "./helpers";

test.describe("Chat: jedes Emoji, Antworten auch im Kanal", () => {
  test("„Weitere Emojis“ findet ein Emoji auf Deutsch und Englisch", async ({ page }) => {
    const text = unique("Pumpe läuft wieder");
    await login(page);
    await openChannel(page, /allgemein/);
    await write(page, text);
    await messageIn(page, text).hover();
    await messageIn(page, text).getByRole("button", { name: "Reagieren" }).click();
    await page.getByRole("button", { name: "Weitere Emojis" }).click();
    const search = page.getByRole("searchbox", { name: "Emoji suchen" });
    await search.fill("schraub");
    const found = page.getByRole("list", { name: "Gefundene Emojis" });
    await expect(found.getByRole("button", { name: /🔧/ })).toBeVisible();
    await search.fill("wrench");
    await found.getByRole("button", { name: "Mit 🔧 schraubenschlüssel reagieren" }).click();
    await expect(messageIn(page, text).getByRole("button", { name: /^🔧 1/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // A flag from its category, without searching.
    await messageIn(page, text).hover();
    await messageIn(page, text).getByRole("button", { name: "Reagieren" }).first().click();
    await page.getByRole("button", { name: "Weitere Emojis" }).click();
    await page.getByRole("button", { name: "Flaggen" }).click();
    await page.getByRole("button", { name: "Mit 🇩🇪 deutschland reagieren" }).click();
    await expect(messageIn(page, text).getByRole("button", { name: /^🇩🇪 1/ })).toBeVisible();
  });

  test("Antwort mit „Auch im Kanal zeigen“ steht im Kanal und führt in den Thread", async ({
    page,
    browser,
  }) => {
    const question = unique("Wer holt die Fliesen?");
    const answer = unique("Ich, morgen früh");
    const quiet = unique("Nur im Thread");
    await login(page);
    const slug = await newChannel(page, ["Max Becker"]);
    await write(page, question);

    const max = await colleague(browser, "max");
    await openChannel(max, slug);
    await messageIn(max, question).hover();
    await messageIn(max, question).getByRole("button", { name: "Antworten" }).click();
    const thread = max.getByRole("complementary", { name: "Thread" });
    await thread.getByRole("textbox", { name: "Nachricht" }).fill(quiet);
    await max.keyboard.press("Enter");
    await expect(thread).toContainText(quiet);
    await thread.getByRole("checkbox", { name: "Auch im Kanal zeigen" }).check();
    await thread.getByRole("textbox", { name: "Nachricht" }).fill(answer);
    await max.keyboard.press("Enter");
    await expect(thread).toContainText("Auch im Kanal gezeigt");
    // Ticked for one answer only.
    await expect(thread.getByRole("checkbox", { name: "Auch im Kanal zeigen" })).not.toBeChecked();

    // Jonas: the answer stands in the channel, marked; the quiet one does not.
    const shown = messageIn(page, answer);
    await expect(shown).toBeVisible();
    await expect(shown).toContainText(`Antwort im Thread zu: ${question}`);
    await expect(page.getByRole("list", { name: "Nachrichten" }).first()).not.toContainText(quiet);
    await shown.getByRole("button", { name: /Antwort im Thread zu/ }).click();
    const opened = page.getByRole("complementary", { name: "Thread" });
    await expect(opened).toContainText(quiet);
    await expect(opened).toContainText(answer);
    await max.context().close();
  });

  test("am Handy zeigt „+“ im Blatt jedes Emoji @phone", async ({ page }) => {
    const text = unique("Kran kommt um 9");
    await login(page);
    await openChannel(page, /allgemein/);
    await write(page, text);
    const message = messageIn(page, text);
    await longPress(message);
    const sheet = page.getByRole("dialog", { name: "Aktionen zur Nachricht" });
    await sheet.getByRole("button", { name: "Weitere Emojis" }).click();
    await expect(sheet.getByRole("button", { name: "Text kopieren" })).toBeHidden();
    await sheet.getByRole("searchbox", { name: "Emoji suchen" }).fill("kran");
    await sheet.getByRole("button", { name: /🏗️/ }).click();
    await expect(sheet).toHaveCount(0);
    await expect(message.getByRole("button", { name: /^🏗️ 1/ })).toBeVisible();
  });
});
