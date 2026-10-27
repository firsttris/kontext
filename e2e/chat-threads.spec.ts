import { type Browser, expect, type Page, test } from "@playwright/test";
import { addMail, login, unique } from "./helpers";

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

const newChannel = async (page: Page, members: string[]) => {
  const name = unique("Lager");
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

const write = async (page: Page, text: string, field = "Nachricht") => {
  await page.getByRole("textbox", { name: field }).last().fill(text);
  await page.keyboard.press("Enter");
};

/**
 * One message in the conversation (not in the thread beside it), as the server has it: the copy
 * shown at once while sending ("pending-…") has no actions yet and may stand beside it a moment.
 */
const messageIn = (page: Page, text: string) =>
  page
    .getByRole("list", { name: "Nachrichten" })
    .first()
    .locator('[data-message]:not([data-message^="pending-"])')
    .filter({ hasText: text });

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
    await messageIn(page, question).getByRole("button", { name: "Antworten" }).click();
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

  test("am Handy führt Zurück dorthin, woher man kam @phone", async ({ page }) => {
    const question = unique("Leiter in Halle 3?");
    await login(page);
    await openChannel(page, /allgemein/);
    await write(page, question);
    await messageIn(page, question).getByRole("button", { name: "Antworten" }).click();
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
    await messageIn(page, question).getByRole("button", { name: "Antworten" }).click();
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
