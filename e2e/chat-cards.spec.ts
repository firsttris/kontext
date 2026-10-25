import { type Browser, expect, type Page, test } from "@playwright/test";
import { addMail, login, unique } from "./helpers";

/** A real (tiny) PNG, so the browser can show it. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const colleague = async (browser: Browser, user: string) => {
  const page = await (await browser.newContext()).newPage();
  await login(page, user);
  return page;
};

const openChannel = async (page: Page, name: string | RegExp) => {
  await page.getByRole("link", { name: /^Chat/ }).first().click();
  await page
    .getByRole("navigation", { name: "Kanäle" })
    .first()
    .getByRole("link", { name })
    .click();
};

/** A named channel with these members, made by the signed-in person; opens it. */
const newChannel = async (page: Page, members: string[]) => {
  const name = unique("Baustelle");
  const slug = name.toLowerCase().replace(/ /g, "-");
  await page.getByRole("link", { name: /^Chat/ }).first().click();
  await page.getByRole("button", { name: "Neue Nachricht" }).click();
  const dialog = page.getByRole("dialog", { name: "Neue Nachricht" });
  await dialog.getByRole("tab", { name: "Kanal" }).click();
  await dialog.getByLabel("Name des Kanals").fill(name);
  for (const member of members) await dialog.getByText(member).click();
  await dialog.getByRole("button", { name: "Kanal anlegen" }).click();
  await expect(page.getByRole("heading", { name: `# ${slug}` })).toBeVisible();
  return slug;
};

test.describe("Chat: Fotos, Dateien und Karten", () => {
  test("schickt ein Foto und eine Datei, nur Mitglieder bekommen sie", async ({
    page,
    browser,
  }) => {
    await login(page);
    const slug = await newChannel(page, ["Max Becker"]);
    await page.locator('input[type="file"][multiple]').setInputFiles([
      { name: "abfluss.png", mimeType: "image/png", buffer: PNG },
      {
        name: "aufmass.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
      },
    ]);
    const tray = page.getByRole("region", { name: "Angehängt" });
    await expect(tray.getByRole("img", { name: "abfluss.png" })).toBeVisible();
    await expect(tray.getByRole("status")).toHaveCount(0);
    await page.getByRole("textbox", { name: "Nachricht" }).fill("Zwei Fotos vom Bad");
    await page.keyboard.press("Enter");
    await expect(tray).toHaveCount(0);

    const max = await colleague(browser, "max");
    await openChannel(max, slug);
    // The picture itself is decoration; its button carries the name.
    const photo = max.getByRole("button", { name: "Foto abfluss.png groß zeigen" }).locator("img");
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
    const pdf = max.getByRole("link", { name: /aufmass\.pdf/ });
    await expect(pdf).toBeVisible();
    await max.getByRole("button", { name: "Foto abfluss.png groß zeigen" }).click();
    await expect(max.getByRole("dialog", { name: "abfluss.png" })).toBeVisible();
    await max.keyboard.press("Escape");

    // Anna is not in the channel: the file stays closed to her.
    const href = (await pdf.getAttribute("href")) ?? "";
    const anna = await colleague(browser, "anna");
    expect((await anna.request.get(href)).status()).toBe(404);
    expect((await max.request.get(href)).headers()["content-disposition"]).toMatch(/^attachment/);
  });

  test("bespricht eine Mail aus info@ im Kanal von info@", async ({ page, browser }) => {
    const subject = unique("Anfrage Fliesen Bad");
    await addMail("jonas", "info", subject);
    await login(page);
    await page.getByRole("link", { name: "info@" }).click();
    await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
    await page.getByRole("button", { name: "Besprechen" }).click();
    const dialog = page.getByRole("dialog", { name: "Über diese Mail sprechen" });
    // info@ is suggested; where the sender came up before may come first.
    await dialog
      .locator("label")
      .filter({ hasText: /^info@/ })
      .click();
    await expect(dialog.getByRole("radio", { name: /^info@/ })).toBeChecked();
    await dialog.getByRole("textbox", { name: "Nachricht" }).fill("Wer ruft zurück?");
    await dialog.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "An info@ geschickt." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Besprochen in info@" })).toBeVisible();

    const anna = await colleague(browser, "anna");
    await openChannel(anna, /^info@/);
    const card = anna.getByRole("link", { name: new RegExp(`Mail · .*${subject}`) });
    await expect(card).toBeVisible();
    await card.click();
    await expect(anna.getByRole("heading", { name: subject })).toBeVisible();

    // An answer in the channel shows up on the mail.
    await openChannel(anna, /^info@/);
    await anna.getByRole("textbox", { name: "Nachricht" }).fill("Mache ich.");
    await anna.keyboard.press("Enter");
    await expect(page.getByRole("link", { name: /Besprochen in info@ · 1 Antwort/ })).toBeVisible();
  });

  test("eine Mail aus dem eigenen Postfach sieht der andere nur als Karte", async ({
    page,
    browser,
  }) => {
    const subject = unique("Angebot Heizung privat");
    await addMail("jonas", "jonas", subject);
    await login(page);
    const slug = await newChannel(page, ["Max Becker"]);
    await page.getByRole("button", { name: "Mail, Aufgabe oder Kontakt verknüpfen" }).click();
    const picker = page.getByRole("dialog", { name: "Mail, Aufgabe oder Kontakt verknüpfen" });
    await picker.getByRole("searchbox", { name: "Suchen" }).fill(subject);
    await picker.getByRole("button", { name: new RegExp(subject) }).click();
    // Back in the field: Enter sends the card.
    await expect(page.getByRole("textbox", { name: "Nachricht" })).toBeFocused();
    await page.keyboard.press("Enter");
    // The message shown at once and the server's answer may stand side by side for a moment.
    await expect(
      page
        .getByRole("list", { name: "Nachrichten" })
        .getByRole("link", { name: new RegExp(subject) })
        .last(),
    ).toBeVisible();

    const max = await colleague(browser, "max");
    await openChannel(max, slug);
    const messages = max.getByRole("list", { name: "Nachrichten" });
    await expect(messages).toContainText(subject);
    await expect(messages).toContainText("Liegt bei Jonas Weber – nur dort zu öffnen");
    await expect(messages.getByRole("link", { name: new RegExp(subject) })).toHaveCount(0);
  });

  test("macht aus einer Nachricht eine Aufgabe und findet zurück", async ({ page }) => {
    const text = unique("Rohr DN 50 bestellen");
    await login(page);
    await newChannel(page, []);
    await page.getByRole("textbox", { name: "Nachricht" }).fill(text);
    await page.keyboard.press("Enter");
    const messages = page.getByRole("list", { name: "Nachrichten" });
    await expect(messages).toContainText(text);
    await messages.getByRole("button", { name: "Aktionen zur Nachricht" }).click();
    await page.getByRole("menuitem", { name: "Aufgabe daraus machen" }).click();
    const dialog = page.getByRole("dialog", { name: "Aufgabe aus dieser Nachricht" });
    await expect(dialog.getByLabel("Titel")).toHaveValue(text);
    await dialog.getByRole("button", { name: "Aufgabe erstellen" }).click();
    const made = messages.getByRole("link", { name: `Aufgabe: ${text} · Offen` });
    await expect(made).toBeVisible();

    await made.click();
    await page
      .getByRole("article", { name: text })
      .getByRole("link", { name: new RegExp(text) })
      .click();
    await expect(page).toHaveURL(/\/chat\?.*message=/);
    await expect(page.getByRole("list", { name: "Nachrichten" })).toContainText(text);
  });

  test("teilt einen Kontakt", async ({ page }) => {
    await login(page);
    await newChannel(page, []);
    await page.getByRole("button", { name: "Mail, Aufgabe oder Kontakt verknüpfen" }).click();
    const picker = page.getByRole("dialog", { name: "Mail, Aufgabe oder Kontakt verknüpfen" });
    await picker.getByRole("tab", { name: "Kontakt" }).click();
    await picker.getByRole("searchbox", { name: "Suchen" }).fill("Petra");
    await picker.getByRole("button", { name: /Petra Keller/ }).click();
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    // The message shown at once and the server's answer may stand side by side for a moment.
    const card = page
      .getByRole("list", { name: "Nachrichten" })
      .getByRole("link", { name: /Kontakt.*Petra Keller/ })
      .last();
    await card.click();
    await expect(page.getByRole("heading", { name: "Petra Keller" })).toBeVisible();
  });
});

test.describe("Chat am Handy: Foto @phone", () => {
  test("Foto über „+“ anhängen und schicken", async ({ page }) => {
    await login(page);
    await page
      .getByRole("navigation", { name: "Apps" })
      .getByRole("link", { name: /^Chat/ })
      .click();
    await page
      .getByRole("navigation", { name: "Kanäle" })
      .getByRole("link", { name: /allgemein/ })
      .click();
    await page.getByRole("button", { name: "Hinzufügen" }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("menuitem", { name: "Foto oder Datei anhängen" }).click();
    await (await chooser).setFiles({ name: "baustelle.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByRole("region", { name: "Angehängt" }).getByRole("status")).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Foto baustelle.png groß zeigen" }).last().locator("img"),
    ).toHaveJSProperty("complete", true);
  });
});
