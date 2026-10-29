import { expect, type Page, test } from "@playwright/test";
import { assertSetOk } from "../src/jmap/client";
import { address, jmapAs, login, personalAccountId, unique } from "./helpers";

/** Max's own folder for each test, so no other test's mails get in the way of the order. */
const USER = "max";

const HOUR = 3_600_000;

/**
 * A folder with three mails: Anton the oldest and unread, Berta flagged, Clara the newest and
 * the largest; with `reply`, a read answer to Anton, newer than all, in the same conversation.
 * Returns the folder's address in the app and a cleanup.
 */
const folderWithMails = async (name: string, { reply = false } = {}) => {
  const client = jmapAs(USER);
  const accountId = await personalAccountId(USER);
  const created = await client.call<{ created: Record<string, { id: string }> }>("Mailbox/set", {
    accountId,
    create: { f: { name, parentId: null } },
  });
  assertSetOk(created, "Mailbox/set");
  const folderId = created.created.f!.id;
  const anton = `<${unique("anton").replace(" ", "-")}@example.test>`;
  const mail = (subject: string, ago: number, keywords: Record<string, true>, body: string) => ({
    mailboxIds: { [folderId]: true },
    keywords,
    from: [{ name: subject.split(" ")[0], email: "kunde@example.test" }],
    to: [{ name: null, email: address(USER) }],
    subject,
    receivedAt: new Date(Date.now() - ago * HOUR).toISOString(),
    bodyValues: { b: { value: body } },
    textBody: [{ partId: "b", type: "text/plain" }],
  });
  const mails = await client.call("Email/set", {
    accountId,
    create: {
      a: { ...mail("Anton fragt nach", 3, {}, "Kurz."), messageId: [anton.slice(1, -1)] },
      b: mail("Berta wartet", 2, { $seen: true, $flagged: true }, "Kurz."),
      c: mail("Clara schickt Pläne", 1, { $seen: true }, "Lang. ".repeat(2000)),
      ...(reply
        ? {
            d: {
              ...mail("Re: Anton fragt nach", 0.5, { $seen: true }, "Antwort."),
              inReplyTo: [anton.slice(1, -1)],
              references: [anton.slice(1, -1)],
            },
          }
        : {}),
    },
  });
  assertSetOk(mails, "Email/set");
  return {
    url: `/mail/${accountId}/${folderId}`,
    remove: () =>
      client.call("Mailbox/set", {
        accountId,
        destroy: [folderId],
        onDestroyRemoveEmails: true,
      }),
  };
};

/** The first names of the listed mails, top to bottom. */
const listed = (page: Page, name: string) =>
  page
    .getByRole("list", { name })
    .getByRole("listitem")
    .allInnerTexts()
    .then((rows) =>
      rows.map((row) => ["Anton", "Berta", "Clara"].find((first) => row.includes(first))),
    );

const sortBy = async (page: Page, choice: string) => {
  await page.getByRole("button", { name: /^Sortierung:/ }).click();
  await page.getByRole("menuitemradio", { name: choice }).click();
};

test.describe("Mailliste sortieren", () => {
  test("sortiert älteste, ungelesene, markierte und große zuerst und merkt sich die Wahl", async ({
    page,
  }) => {
    const name = unique("Sortieren");
    const folder = await folderWithMails(name);
    try {
      await login(page, USER);
      await page.goto(folder.url);
      await expect.poll(() => listed(page, name)).toEqual(["Clara", "Berta", "Anton"]);

      await sortBy(page, "Älteste zuerst");
      await expect.poll(() => listed(page, name)).toEqual(["Anton", "Berta", "Clara"]);
      await sortBy(page, "Ungelesene zuerst");
      await expect.poll(() => listed(page, name)).toEqual(["Anton", "Clara", "Berta"]);
      await sortBy(page, "Größte zuerst");
      await expect.poll(() => listed(page, name)).toEqual(["Clara", "Anton", "Berta"]);
      await sortBy(page, "Markierte zuerst");
      await expect.poll(() => listed(page, name)).toEqual(["Berta", "Clara", "Anton"]);

      // The menu shows the choice, and it is kept for the next visit.
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Sortierung: Markierte zuerst" }),
      ).toBeVisible();
      await expect.poll(() => listed(page, name)).toEqual(["Berta", "Clara", "Anton"]);

      await sortBy(page, "Neueste zuerst");
      await expect.poll(() => listed(page, name)).toEqual(["Clara", "Berta", "Anton"]);
    } finally {
      await folder.remove();
    }
  });

  test("sortiert in der Gesprächsansicht nach dem ganzen Gespräch", async ({ page }) => {
    const name = unique("Gespräche");
    const folder = await folderWithMails(name, { reply: true });
    try {
      await page.addInitScript(() => window.localStorage.setItem("kontext.mail.threads", "on"));
      await login(page, USER);
      await page.goto(folder.url);
      const first = page.getByRole("list", { name }).getByRole("listitem").first();
      // Anton's conversation has an unread mail: it comes first, shown by its newest (the answer).
      await sortBy(page, "Ungelesene zuerst");
      await expect.poll(() => listed(page, name)).toEqual(["Anton", "Clara", "Berta"]);
      await expect(first).toContainText("Re: Anton fragt nach");
      await sortBy(page, "Markierte zuerst");
      await expect.poll(() => listed(page, name)).toEqual(["Berta", "Anton", "Clara"]);
      await sortBy(page, "Absender (A–Z)");
      await expect.poll(() => listed(page, name)).toEqual(["Anton", "Berta", "Clara"]);
    } finally {
      await folder.remove();
    }
  });
});

test.describe("Mailliste sortieren am Handy @phone", () => {
  test("wählt die Reihenfolge oben in der Liste @phone", async ({ page }) => {
    const name = unique("Sortieren");
    const folder = await folderWithMails(name);
    try {
      await login(page, USER);
      await page.goto(folder.url);
      await expect.poll(() => listed(page, name)).toEqual(["Clara", "Berta", "Anton"]);
      await sortBy(page, "Älteste zuerst");
      await expect.poll(() => listed(page, name)).toEqual(["Anton", "Berta", "Clara"]);
      await expect(page.getByRole("button", { name: "Sortierung: Älteste zuerst" })).toBeVisible();
    } finally {
      await folder.remove();
    }
  });
});
