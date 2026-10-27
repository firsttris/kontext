import { type Browser, expect, type Page, test } from "@playwright/test";
import { login, unique } from "./helpers";

/** A second person in a browser of their own. */
const colleague = async (browser: Browser, user: string) => {
  const page = await (await browser.newContext()).newPage();
  await login(page, user);
  return page;
};

const openChat = async (page: Page) => {
  await page.getByRole("link", { name: /^Chat/ }).first().click();
  await expect(page.getByRole("navigation", { name: "Kanäle" }).first()).toBeVisible();
};

/**
 * The microphone answers a second late, as while the browser asks the person the first time; the
 * page keeps every stream it handed out, to count what is still recording.
 */
const slowMicrophone = (page: Page) =>
  page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const streams: MediaStream[] = [];
    (window as unknown as { streams: MediaStream[] }).streams = streams;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const stream = await original(constraints);
      streams.push(stream);
      return stream;
    };
  });

const liveTracks = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { streams: MediaStream[] }).streams
        .flatMap((stream) => stream.getTracks())
        .filter((track) => track.readyState === "live").length,
  );

const openDirectWithMax = async (page: Page) => {
  await page.getByRole("button", { name: "Neue Nachricht" }).click();
  const dialog = page.getByRole("dialog", { name: "Neue Nachricht" });
  await dialog.getByText("Max Becker").click();
  await dialog.getByRole("button", { name: "Chat beginnen" }).click();
  await expect(page.getByRole("textbox", { name: "Nachricht" })).toBeVisible();
};

const write = async (page: Page, text: string) => {
  await page.getByRole("textbox", { name: "Nachricht" }).fill(text);
  await page.keyboard.press("Enter");
};

test.describe("Chat", () => {
  test("Direktnachricht kommt live an, mit „schreibt …“, Erwähnung und „Gelesen“", async ({
    page,
    browser,
  }) => {
    const text = unique("Kannst du kurz anrufen?");
    await login(page);
    await openChat(page);
    const sandra = await colleague(browser, "sandra");

    await page.getByRole("button", { name: "Neue Nachricht" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Nachricht" });
    await dialog.getByText("Sandra Klein").click();
    await dialog.getByRole("button", { name: "Chat beginnen" }).click();
    await expect(page.getByRole("heading", { name: "Sandra Klein" })).toBeVisible();
    await write(page, text);
    await expect(page.getByRole("list", { name: "Nachrichten" })).toContainText(text);

    // Sandra sees it without reloading: on "Chat" in the rail, then in the conversation.
    // (Sandra may have more unread elsewhere, e.g. in info@ from other tests.)
    await expect(sandra.getByRole("link", { name: /^Chat, \d+ ungelesen$/ })).toBeVisible();
    await openChat(sandra);
    await sandra
      .getByRole("navigation", { name: "Direktnachrichten" })
      .first()
      .getByRole("link", { name: /Jonas Weber/ })
      .click();
    await expect(sandra.getByRole("list", { name: "Nachrichten" })).toContainText(text);
    await expect(page.getByText("Gelesen", { exact: true })).toBeVisible();
    await expect(
      sandra
        .getByRole("navigation", { name: "Direktnachrichten" })
        .first()
        .getByRole("link", { name: /Jonas Weber/ }),
    ).not.toContainText(/\d/);

    const field = sandra.getByRole("textbox", { name: "Nachricht" });
    await field.pressSequentially("@Jo");
    await expect(page.getByText("Sandra schreibt …")).toBeVisible();
    await sandra.getByRole("option", { name: "Jonas Weber" }).click();
    await field.pressSequentially("mache ich gleich");
    await sandra.keyboard.press("Enter");
    await expect(page.getByRole("list", { name: "Nachrichten" })).toContainText(
      "@Jonas mache ich gleich",
    );
    await expect(page.getByText("Sandra schreibt …")).toHaveCount(0);
    const sent = await page.evaluate(async () => {
      const { channels } = await (await fetch("/api/chat/channels")).json();
      // The conversation with Sandra (other direct ones may exist, e.g. from the call tests).
      const direct = channels.find(
        (c: { kind: string; last: { text: string } | null }) =>
          c.kind === "direct" && c.last?.text.endsWith("mache ich gleich"),
      );
      const { messages } = await (await fetch(`/api/chat/channels/${direct.id}/messages`)).json();
      return messages[0];
    });
    expect(sent.mentions).toHaveLength(1);
  });

  test("Sprachnachricht: aufnehmen, verwerfen, schicken und abspielen", async ({
    page,
    browser,
  }) => {
    // The browser's microphone is a fake one that beeps (playwright.config.ts).
    await login(page);
    await openChat(page);
    await page.getByRole("button", { name: "Neue Nachricht" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Nachricht" });
    await dialog.getByText("Max Becker").click();
    await dialog.getByRole("button", { name: "Chat beginnen" }).click();
    const list = page.getByRole("list", { name: "Nachrichten" });
    const voices = list.getByRole("group", { name: /^Sprachnachricht, / });
    const before = await voices.count();

    // Thrown away: nothing is sent.
    await page.getByRole("button", { name: "Sprachnachricht aufnehmen" }).click();
    await expect(page.getByRole("group", { name: "Aufnahme läuft" })).toBeVisible();
    await page.getByRole("button", { name: "Aufnahme verwerfen" }).click();
    await expect(page.getByRole("textbox", { name: "Nachricht" })).toBeVisible();

    await page.getByRole("button", { name: "Sprachnachricht aufnehmen" }).click();
    await expect(page.getByRole("timer")).toHaveText("0:02");
    await page.getByRole("button", { name: "Sprachnachricht senden" }).click();
    await expect(voices).toHaveCount(before + 1);
    const voice = voices.last();
    await expect(voice).toHaveAccessibleName(/^Sprachnachricht, 0:0[2-3]$/);
    await voice.getByRole("button", { name: "Abspielen" }).click();
    await expect(voice.getByRole("button", { name: "Anhalten" })).toBeVisible();
    await voice.getByRole("button", { name: "Tempo 1-fach, ändern" }).click();
    await expect(voice.getByRole("button", { name: "Tempo 1.5-fach, ändern" })).toBeVisible();

    // Max gets it, in the list as "Sprachnachricht", and can play it.
    const max = await colleague(browser, "max");
    await openChat(max);
    const lastLines = await max.evaluate(async () => {
      const { channels } = await (await fetch("/api/chat/channels")).json();
      return channels
        .filter((c: { kind: string }) => c.kind === "direct")
        .map((c: { last: { text: string } | null }) => c.last?.text);
    });
    expect(lastLines).toContain("Sprachnachricht");
    await max
      .getByRole("navigation", { name: "Direktnachrichten" })
      .first()
      .getByRole("link", { name: /Jonas Weber/ })
      .click();
    const heard = max
      .getByRole("list", { name: "Nachrichten" })
      .getByRole("group", { name: /^Sprachnachricht, 0:0[2-3]$/ })
      .last();
    await heard.getByRole("button", { name: "Abspielen" }).click();
    await expect(heard.getByRole("button", { name: "Anhalten" })).toBeVisible();
  });

  test("Sprachnachricht: ein zweiter Klick, während das Mikrofon gefragt wird, lässt es wieder los", async ({
    page,
  }) => {
    await slowMicrophone(page);
    await login(page);
    await openChat(page);
    await openDirectWithMax(page);
    const mic = page.getByRole("button", { name: "Sprachnachricht aufnehmen" });
    await mic.click();
    await mic.click();
    await expect(page.getByRole("group", { name: "Aufnahme läuft" })).toBeVisible();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Aufnahme verwerfen" }).click();
    await expect(page.getByRole("textbox", { name: "Nachricht" })).toBeVisible();
    await expect.poll(() => liveTracks(page)).toBe(0);
  });

  test("Sprachnachricht: wer die Unterhaltung verlässt, während das Mikrofon gefragt wird, nimmt nichts auf", async ({
    page,
  }) => {
    await slowMicrophone(page);
    await login(page);
    await openChat(page);
    await openDirectWithMax(page);
    await page.getByRole("button", { name: "Sprachnachricht aufnehmen" }).click();
    await page
      .getByRole("link", { name: /^E-Mail|^Mail/ })
      .first()
      .click();
    await page.waitForTimeout(1500);
    await expect.poll(() => liveTracks(page)).toBe(0);
  });

  test("ein Kanal gehört seinen Mitgliedern", async ({ page, browser }) => {
    const name = unique("Baustelle Hoffmann");
    const slug = name.toLowerCase().replace(/ /g, "-");
    await login(page);
    await openChat(page);
    await page.getByRole("button", { name: "Neue Nachricht" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Nachricht" });
    await dialog.getByRole("tab", { name: "Kanal" }).click();
    await dialog.getByLabel("Name des Kanals").fill(name);
    await expect(dialog).toContainText(`Wird zu #${slug}`);
    await dialog.getByText("Max Becker").click();
    await dialog.getByRole("button", { name: "Kanal anlegen" }).click();
    await expect(page.getByRole("heading", { name: `# ${slug}` })).toBeVisible();
    await write(page, "Abfluss im Bad OG ist enger als gedacht.");
    const url = page.url();

    const max = await colleague(browser, "max");
    await openChat(max);
    await max
      .getByRole("navigation", { name: "Kanäle" })
      .first()
      .getByRole("link", { name: slug })
      .click();
    await expect(max.getByRole("list", { name: "Nachrichten" })).toContainText("Abfluss im Bad OG");
    // Max is in no shared mailbox: no info@ channel for him.
    await expect(
      max.getByRole("navigation", { name: "Kanäle" }).first().getByRole("link", { name: "info@" }),
    ).toHaveCount(0);

    const anna = await colleague(browser, "anna");
    await anna.goto(url.replace(/^https?:\/\/[^/]+/, ""));
    await expect(
      anna.getByText("Diesen Chat gibt es nicht, oder du gehörst nicht dazu."),
    ).toBeVisible();

    // Adding Anna later.
    await page.getByRole("button", { name: "Kanal bearbeiten" }).click();
    await page.getByRole("dialog", { name: "Kanal bearbeiten" }).getByText("Anna Weber").click();
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(anna.getByRole("heading", { name: `# ${slug}` })).toBeVisible();
  });

  test("#allgemein und der Kanal von info@ sind für alle, die dazugehören", async ({
    page,
    browser,
  }) => {
    const text = unique("Herr Lang ruft heute nochmal an");
    await login(page);
    await openChat(page);
    const channels = page.getByRole("navigation", { name: "Kanäle" }).first();
    await expect(channels.getByRole("link", { name: "allgemein" })).toBeVisible();
    await channels.getByRole("link", { name: "info@" }).click();
    await expect(page.getByRole("heading", { name: "info@" })).toBeVisible();
    await write(page, text);

    const anna = await colleague(browser, "anna");
    await openChat(anna);
    await anna
      .getByRole("navigation", { name: "Kanäle" })
      .first()
      .getByRole("link", { name: /info@/ })
      .click();
    await expect(anna.getByRole("list", { name: "Nachrichten" })).toContainText(text);
  });

  test("Aufgaben kommen live, ohne Neuladen", async ({ page, browser }) => {
    const title = unique("Rückruf Herr Lang");
    const anna = await colleague(browser, "anna");
    await anna.getByRole("link", { name: "Aufgaben", exact: true }).first().click();
    await anna.getByRole("link", { name: /info@/ }).first().click();
    await login(page);
    await page.evaluate(async (task) => {
      const session = await (await fetch("/jmap/session")).json();
      const info = Object.entries(session.accounts).find(([, account]) =>
        (account as { name: string }).name.startsWith("info@"),
      )![0];
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: info, title: task }),
      });
    }, title);
    // The tasks used to come every 30 seconds; now within moments.
    await expect(anna.getByText(title)).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Chat am Handy @phone", () => {
  test("Liste, Kanal und zurück, Kontakte unter „Mehr“", async ({ page }) => {
    await login(page);
    const tabs = page.getByRole("navigation", { name: "Apps" });
    await tabs.getByRole("link", { name: /^Chat/ }).click();
    await expect(page.getByRole("heading", { name: "Chat" })).toBeVisible();
    await page
      .getByRole("navigation", { name: "Kanäle" })
      .getByRole("link", { name: /allgemein/ })
      .click();
    await expect(page.getByRole("heading", { name: "# allgemein" })).toBeVisible();
    await expect(tabs).toHaveCount(0);
    // Nothing to send yet: the microphone stands where "Senden" will.
    await expect(page.getByRole("button", { name: "Sprachnachricht aufnehmen" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Senden" })).toBeHidden();
    const text = unique("Freitag gibt es Kuchen");
    await write(page, text);
    await expect(page.getByRole("list", { name: "Nachrichten" })).toContainText(text);
    await page.getByRole("button", { name: "Zurück zu den Chats" }).click();
    await expect(page.getByRole("navigation", { name: "Kanäle" })).toContainText(text);

    await page.getByRole("button", { name: "Mehr" }).click();
    await page.getByRole("menuitem", { name: "Kontakte" }).click();
    await expect(page.getByRole("searchbox", { name: "Kontakte suchen" })).toBeVisible();
  });

  test("ein Kanal öffnet unten, bei der neuesten Nachricht", async ({ page }) => {
    await login(page);
    await page
      .getByRole("navigation", { name: "Apps" })
      .getByRole("link", { name: /^Chat/ })
      .click();
    const channels = page.getByRole("navigation", { name: "Kanäle" });
    await channels.getByRole("link", { name: /allgemein/ }).click();
    const messages = page.getByRole("list", { name: "Nachrichten" });
    // More than a screen, so that the list scrolls.
    const texts = Array.from({ length: 14 }, (_, index) => unique(`Zeile ${index + 1}`));
    for (const text of texts) {
      await write(page, text);
      await expect(messages).toContainText(text);
    }
    await page.getByRole("button", { name: "Zurück zu den Chats" }).click();
    await channels.getByRole("link", { name: /allgemein/ }).click();
    await expect(messages).toContainText(texts.at(-1)!);
    const scroller = messages.locator("xpath=..");
    await expect
      .poll(() =>
        scroller.evaluate((element) => ({
          scrolls: element.scrollHeight > element.clientHeight,
          atBottom: element.scrollHeight - element.scrollTop - element.clientHeight < 2,
        })),
      )
      .toEqual({ scrolls: true, atBottom: true });
    await expect(messages.getByText(texts.at(-1)!)).toBeInViewport();
  });
});
