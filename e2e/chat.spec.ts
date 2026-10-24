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
      const direct = channels.find((c: { kind: string }) => c.kind === "direct");
      const { messages } = await (await fetch(`/api/chat/channels/${direct.id}/messages`)).json();
      return messages[0];
    });
    expect(sent.mentions).toHaveLength(1);
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
    const text = unique("Freitag gibt es Kuchen");
    await write(page, text);
    await expect(page.getByRole("list", { name: "Nachrichten" })).toContainText(text);
    await page.getByRole("link", { name: "Zurück zu den Chats" }).click();
    await expect(page.getByRole("navigation", { name: "Kanäle" })).toContainText(text);

    await page.getByRole("button", { name: "Mehr" }).click();
    await page.getByRole("menuitem", { name: "Kontakte" }).click();
    await expect(page.getByRole("searchbox", { name: "Kontakte suchen" })).toBeVisible();
  });
});
