import { expect, type Locator, type Page, test } from "@playwright/test";
import { colleague, messageIn, newChannel, openChannel, write } from "./chat-helpers";
import { addMail, login, longPress, unique } from "./helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** On a phone: the thread through the sheet a long press on the message opens. */
const replyOnPhone = async (page: Page, text: string) => {
  await longPress(messageIn(page, text));
  await page.getByRole("button", { name: "Im Thread antworten" }).click();
};

/**
 * Holds a finger on an element as long as a long press takes and says whether the press keeps the
 * browser's own menu away (text selection, paste, a link's menu), as it does for the sheet.
 */
const pressBlocksOwnMenu = (target: Locator) =>
  target.evaluate(async (element) => {
    const box = element.getBoundingClientRect();
    const finger = {
      pointerType: "touch",
      isPrimary: true,
      bubbles: true,
      clientX: box.x + 10,
      clientY: box.y + 10,
    };
    element.dispatchEvent(new PointerEvent("pointerdown", finger));
    await new Promise((resolve) => setTimeout(resolve, 550));
    const menu = new MouseEvent("contextmenu", { ...finger, cancelable: true });
    element.dispatchEvent(menu);
    element.dispatchEvent(new PointerEvent("pointerup", finger));
    return menu.defaultPrevented;
  });

/** A tap held a little longer than a long press takes, the finger as Chrome sends it. */
const slowTap = async (target: Locator) => {
  const box = (await target.boundingBox())!;
  const page = target.page();
  const cdp = await page.context().newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await page.waitForTimeout(550);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
};

test.describe("Chat: Reaktionen und Antworten", () => {
  test("Reaktionen kommen live an, eigene lassen sich wegnehmen", async ({ page, browser }) => {
    const text = unique("Rohr ist da");
    await login(page);
    const slug = await newChannel(page, ["Max Becker"]);
    await write(page, text);
    await messageIn(page, text).hover();
    await messageIn(page, text).getByRole("button", { name: "Reagieren" }).click();
    await page.getByRole("button", { name: "Mit 👍 reagieren" }).click();
    await expect(messageIn(page, text).getByRole("button", { name: /^👍 1/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const max = await colleague(browser, "max");
    await openChannel(max, slug);
    const thumbs = messageIn(max, text).getByRole("button", { name: /^👍 1: Jonas/ });
    await expect(thumbs).toHaveAttribute("aria-pressed", "false");
    await thumbs.click();
    await expect(
      messageIn(page, text).getByRole("button", { name: /^👍 2: Du und Max/ }),
    ).toBeVisible();
    await messageIn(page, text).getByRole("button", { name: /^👍 2/ }).click();
    await expect(messageIn(max, text).getByRole("button", { name: /^👍 1: Du$/ })).toBeVisible();
  });

  test("Antworten im Thread: nicht im Kanal, unter der Nachricht gezählt", async ({
    page,
    browser,
  }) => {
    const question = unique("Wer holt das Rohr?");
    const answer = unique("Ich, um zehn");
    await login(page);
    const slug = await newChannel(page, ["Max Becker"]);
    await write(page, question);

    const max = await colleague(browser, "max");
    await openChannel(max, slug);
    await messageIn(max, question).hover();
    await messageIn(max, question).getByRole("button", { name: "Antworten" }).click();
    const thread = max.getByRole("complementary", { name: "Thread" });
    await expect(thread).toContainText(question);
    await thread.getByRole("textbox", { name: "Nachricht" }).fill(answer);
    await max.keyboard.press("Enter");
    await expect(thread).toContainText(answer);

    // Jonas: the answer is not in the channel, the question counts it, new.
    await expect(
      messageIn(page, question).getByRole("button", { name: /1 Antwort/ }),
    ).toContainText("Neu");
    await expect(page.getByRole("list", { name: "Nachrichten" }).first()).not.toContainText(answer);
    await messageIn(page, question)
      .getByRole("button", { name: /1 Antwort/ })
      .click();
    await expect(page).toHaveURL(/thread=/);
    await expect(page.getByRole("complementary", { name: "Thread" })).toContainText(answer);
    await page.getByRole("button", { name: "Schließen" }).click();
    await expect(page.getByRole("complementary", { name: "Thread" })).toHaveCount(0);
  });

  test("Suche findet Umlaute in jeder Schreibweise", async ({ page }) => {
    const word = unique("ÖLWECHSEL");
    await login(page);
    await newChannel(page, ["Max Becker"]);
    await write(page, `${word} in Halle 3 erledigt`);
    await page.getByRole("searchbox", { name: "Im Chat suchen" }).first().fill(word.toLowerCase());
    await expect(page.getByRole("list", { name: "Treffer im Chat" })).toContainText("Halle 3");
  });

  test("Fotos zeigt der Verlauf als kleines Vorschaubild", async ({ page }) => {
    await login(page);
    await newChannel(page, ["Max Becker"]);
    await page
      .locator('input[type="file"][multiple]')
      .setInputFiles([{ name: "keller.png", mimeType: "image/png", buffer: PNG }]);
    await expect(page.getByRole("region", { name: "Angehängt" }).getByRole("status")).toHaveCount(
      0,
    );
    await write(page, "Feuchte Wand im Keller");
    // The message shown at once and the server's answer may stand side by side for a moment.
    const photo = page
      .getByRole("button", { name: "Foto keller.png groß zeigen" })
      .last()
      .locator("img");
    await expect(photo).toHaveAttribute("src", /\?thumb=1$/);
    const response = await page.request.get((await photo.getAttribute("src"))!);
    expect(response.headers()["content-type"]).toBe("image/jpeg");
    // Opened big: the photo itself.
    await page.getByRole("button", { name: "Foto keller.png groß zeigen" }).last().click();
    await expect(
      page.getByRole("dialog", { name: "keller.png" }).getByRole("img", { name: "keller.png" }),
    ).toHaveAttribute("src", /files\/[^?]+$/);
  });

  test("Mail als Kopie: lesbar auch ohne Zugriff aufs Postfach", async ({ page, browser }) => {
    const subject = unique("Angebot Dachrinne");
    await addMail("jonas", "jonas", subject);
    await login(page);
    await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
    await page.getByRole("button", { name: "Besprechen" }).click();
    const dialog = page.getByRole("dialog", { name: "Über diese Mail sprechen" });
    await dialog.getByRole("textbox", { name: "An Kanal oder Person" }).fill("Max");
    await dialog.getByLabel("Als Kopie teilen").check();
    await dialog.getByRole("textbox", { name: "Nachricht" }).fill("Schau mal drüber");
    await dialog.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /geschickt/ })).toBeVisible();

    const max = await colleague(browser, "max");
    await max.getByRole("link", { name: /^Chat/ }).first().click();
    await max
      .getByRole("navigation", { name: "Direktnachrichten" })
      .first()
      .getByRole("link", { name: /Jonas Weber/ })
      .click();
    const card = max.getByRole("button", { name: new RegExp(subject) });
    await expect(card).toContainText("Als Kopie geteilt – hier lesen");
    await card.click();
    const copy = max.getByRole("dialog", { name: subject });
    await expect(copy).toContainText("Erika Test <erika@example.test>");
    await expect(
      copy.frameLocator("iframe").getByText("Eine Mail nur für diesen Test."),
    ).toBeVisible();
  });

  test("am Handy ersetzt der Thread das Gespräch @phone", async ({ page }) => {
    const question = unique("Schlüssel Halle 2?");
    await login(page);
    await openChannel(page, /allgemein/);
    await write(page, question);
    await replyOnPhone(page, question);
    const thread = page.getByRole("complementary", { name: "Thread" });
    await expect(thread).toBeVisible();
    await expect(page.getByRole("list", { name: "Nachrichten" })).toBeHidden();
    await write(page, "Liegt im Büro");
    await expect(thread).toContainText("Liegt im Büro");
    await thread.getByRole("button", { name: "Zurück zum Gespräch" }).click();
    await expect(
      messageIn(page, question).getByRole("button", { name: /1 Antwort/ }),
    ).toBeVisible();
  });

  test("am Handy öffnet langes Drücken Reaktionen und Aktionen @phone", async ({ page }) => {
    const text = unique("Kran kommt um 7");
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await login(page);
    await openChannel(page, /allgemein/);
    await write(page, text);
    const message = messageIn(page, text);
    // Nothing next to the bubble: no small icons whose message one has to guess.
    await expect(message.getByRole("button", { name: "Reagieren" })).toBeHidden();
    await expect(message.getByRole("button", { name: "Antworten" })).toBeHidden();

    await longPress(message);
    const sheet = page.getByRole("dialog", { name: "Aktionen zur Nachricht" });
    await sheet.getByRole("button", { name: "Mit 👍 reagieren" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(message.getByRole("button", { name: /^👍 1/ })).toBeVisible();

    await longPress(message);
    await sheet.getByRole("button", { name: "Text kopieren" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Text kopiert" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  });

  test("am Handy kommt auch ein langsamer Tipp im Blatt an @phone", async ({ page }) => {
    const text = unique("Kran kommt um 10");
    await login(page);
    await openChannel(page, /allgemein/);
    await write(page, text);
    const message = messageIn(page, text);
    await longPress(message);
    // The sheet's choice, not a second long press on the message behind it.
    await slowTap(
      page
        .getByRole("dialog", { name: "Aktionen zur Nachricht" })
        .getByRole("button", { name: "Mit 👍 reagieren" }),
    );
    await expect(message.getByRole("button", { name: /^👍 1/ })).toBeVisible();
  });

  test("am Handy gehört langes Drücken im Bearbeiten-Feld dem Text @phone", async ({ page }) => {
    const text = unique("Kran kommt um 8");
    await login(page);
    await openChannel(page, /allgemein/);
    await write(page, text);
    await longPress(messageIn(page, text));
    await page
      .getByRole("dialog", { name: "Aktionen zur Nachricht" })
      .getByRole("button", { name: "Bearbeiten" })
      .click();
    // Selecting or pasting in the field is the browser's long press, not a second sheet.
    expect(await pressBlocksOwnMenu(page.getByRole("textbox", { name: "Bearbeiten" }))).toBe(false);
  });

  test("am Handy führt Zurück dorthin, woher man kam @phone", async ({ page }) => {
    const question = unique("Leiter in Halle 3?");
    await login(page);
    await openChannel(page, /allgemein/);
    await write(page, question);
    await replyOnPhone(page, question);
    const thread = page.getByRole("complementary", { name: "Thread" });
    await expect(thread).toBeVisible();
    // No keyboard over the thread just opened.
    await expect(thread.getByRole("textbox", { name: "Nachricht" })).not.toBeFocused();

    await thread.getByRole("button", { name: "Zurück zum Gespräch" }).click();
    await expect(thread).toHaveCount(0);
    await expect(messageIn(page, question)).toBeInViewport();
    // One swipe back from the conversation is the list, not the thread again.
    await page.goBack();
    await expect(page).not.toHaveURL(/channel=/);
    await expect(page.getByRole("navigation", { name: "Kanäle" })).toBeVisible();

    // Swiped back instead of tapped: the same way.
    await page.goForward();
    await replyOnPhone(page, question);
    await expect(thread).toBeVisible();
    await page.goBack();
    await expect(thread).toHaveCount(0);
    await expect(messageIn(page, question)).toBeInViewport();
    await page.getByRole("button", { name: "Zurück zu den Chats" }).click();
    await expect(page).not.toHaveURL(/channel=/);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/chat/);
  });

  test("Kanal bearbeiten legt keinen zweiten Eintrag im Verlauf an", async ({ page }) => {
    await login(page);
    const slug = await newChannel(page, ["Max Becker"]);
    await page.goto("/chat");
    await openChannel(page, slug);
    await page.getByRole("button", { name: "Kanal bearbeiten" }).click();
    const dialog = page.getByRole("dialog", { name: "Kanal bearbeiten" });
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toHaveCount(0);
    await page.goBack();
    await expect(page).not.toHaveURL(/channel=/);
  });

  test("Kanal bearbeiten, dann Zurück zur Liste @phone", async ({ page }) => {
    await login(page);
    const slug = await newChannel(page, ["Max Becker"]);
    const url = page.url();
    await page.goto("/mail");
    // Opened by a link: nothing before it to go back to.
    await page.goto(url);
    await expect(page.getByRole("heading", { name: `# ${slug}` })).toBeVisible();
    await page.getByRole("button", { name: "Kanal bearbeiten" }).click();
    const dialog = page.getByRole("dialog", { name: "Kanal bearbeiten" });
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Zurück zu den Chats" }).click();
    await expect(page).not.toHaveURL(/channel=/);
  });
});

test.describe("Chat am Tablet", () => {
  test.use({ viewport: { width: 1024, height: 1366 }, hasTouch: true, isMobile: true });

  test("langes Drücken bleibt beim Browser, ein langsamer Tipp kommt an", async ({ page }) => {
    const text = unique("Kran kommt um 9");
    await login(page);
    await openChannel(page, /allgemein/);
    await write(page, text);
    const message = messageIn(page, text);
    await message.getByRole("button", { name: "Reagieren" }).click();
    await page.getByRole("button", { name: "Mit 👍 reagieren" }).click();
    const thumbs = message.getByRole("button", { name: /^👍 1/ });
    await expect(thumbs).toBeVisible();
    // No sheet on a tablet: the long press keeps the browser's menu (select, copy a link).
    expect(await pressBlocksOwnMenu(message)).toBe(false);

    // A tap held a little longer is still a tap.
    await slowTap(thumbs);
    await expect(thumbs).toHaveCount(0);
  });
});

test.describe("Firmenverwaltung: Team-Chat", () => {
  test("Aufbewahrung einstellen, der Chat sagt es", async ({ page }) => {
    await login(page);
    await page.goto("/settings?section=company-chat");
    const keep = page.getByRole("combobox", { name: /Nachrichten aufbewahren/ });
    await keep.selectOption({ label: "5 Jahre" });
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Gespeichert/ })).toBeVisible();

    // In a new channel the start of its history is in view.
    await newChannel(page, ["Max Becker"]);
    await expect(page.getByText(/Nachrichten bleiben 5 Jahre/)).toBeVisible();

    // Back to for ever, as the other tests expect.
    await page.goto("/settings?section=company-chat");
    await keep.selectOption({ label: "Unbegrenzt" });
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Gespeichert/ })).toBeVisible();
  });
});
