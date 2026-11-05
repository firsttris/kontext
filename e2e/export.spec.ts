import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { address, jmapAs, login, personalAccountId, unique } from "./helpers";

/** Max's folders and calendars: made for each test and deleted by it. */
const USER = "max";
const CALENDARS = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:calendars"];

type Created = { created: Record<string, { id: string }> };

/** A folder with two mails, the first read and flagged; returns how to remove it again. */
const folderWithTwoMails = async (name: string, subjects: [string, string]) => {
  const client = jmapAs(USER);
  const accountId = await personalAccountId(USER);
  const { created } = await client.call<Created>("Mailbox/set", {
    accountId,
    create: { f: { name, parentId: null } },
  });
  const folderId = created.f!.id;
  const mail = (subject: string, keywords: Record<string, true>) => ({
    mailboxIds: { [folderId]: true },
    keywords,
    from: [{ name: "Petra Keller", email: "petra@keller-elektro.test" }],
    to: [{ name: null, email: address(USER) }],
    subject,
    receivedAt: new Date().toISOString(),
    bodyValues: { b: { value: "Nur fuer diesen Test." } },
    textBody: [{ partId: "b", type: "text/plain" }],
  });
  await client.call("Email/set", {
    accountId,
    create: { a: mail(subjects[0], { $seen: true, $flagged: true }), b: mail(subjects[1], {}) },
  });
  return () =>
    client.call("Mailbox/set", { accountId, destroy: [folderId], onDestroyRemoveEmails: true });
};

/** The Subject lines of the file, each on one line (RFC 5322 §2.2.3). */
const unfoldedHeaders = (mbox: string) =>
  mbox.replace(/\r?\n[ \t]+/g, " ").match(/^Subject: .*$/gm) ?? [];

/** The UTF-8 encoded words of a header (RFC 2047 §4), the space between two of them dropped. */
const decodeWords = (header: string) =>
  header
    .replace(/(\?=)\s+(=\?)/g, "$1$2")
    .replace(/=\?utf-8\?([QB])\?([^?]*)\?=/gi, (_, encoding: string, data: string) =>
      encoding.toUpperCase() === "B"
        ? Buffer.from(data, "base64").toString("utf8")
        : Buffer.from(
            data
              .replace(/_/g, " ")
              .replace(/=([0-9A-F]{2})/gi, (_hex, hex: string) =>
                String.fromCharCode(Number.parseInt(hex, 16)),
              ),
            "latin1",
          ).toString("utf8"),
    )
    .replace(/\r$/, "");

const exportFolder = async (page: Page, folder: string, subjects: [string, string]) => {
  await page.getByRole("button", { name: `Ordnermenü „${folder}“` }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Als .mbox exportieren" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${folder}.mbox`);
  const mbox = await readFile(await download.path(), "utf8");
  expect(mbox.match(/^From \S+ \w{3} \w{3} [ \d]\d \d\d:\d\d:\d\d \d{4}\r?$/gm)).toHaveLength(2);
  // The messages as Stalwart stored them: a subject with "ü" is an encoded word (RFC 2047),
  // which the export leaves as it is.
  expect(mbox).toMatch(/^Subject: =\?utf-8\?[QB]\?/im);
  const subjectsInFile = unfoldedHeaders(mbox).map(decodeWords);
  expect(subjectsInFile).toContain(`Subject: ${subjects[0]}`);
  expect(subjectsInFile).toContain(`Subject: ${subjects[1]}`);
  // The read and flagged first mail, the unread second (mboxrd escaping: src/lib/mbox.test.ts).
  expect(mbox).toMatch(/Status: RO\r?\nX-Status: F\r?\n/);
  expect(mbox).toMatch(/Status: O\r?\n/);
};

const exportFolderTest = async (page: Page, phone: boolean) => {
  const folder = unique("Archiv");
  const subjects: [string, string] = [unique("Angebot Heizung"), unique("Rückfrage Angebot")];
  const remove = await folderWithTwoMails(folder, subjects);
  try {
    await login(page, USER);
    if (phone) await page.goto(`/mail/${await personalAccountId(USER)}/inbox?folders=true`);
    await expect(page.getByRole("link", { name: folder })).toBeVisible();
    await exportFolder(page, folder, subjects);
  } finally {
    await remove();
  }
};

/** A calendar of Max's with one event; returns how to remove it again. */
const calendarWithOneEvent = async (name: string, title: string) => {
  const client = jmapAs(USER);
  const accountId = await personalAccountId(USER);
  const { created } = await client.call<Created>(
    "Calendar/set",
    { accountId, create: { c: { name } } },
    CALENDARS,
  );
  const calendarId = created.c!.id;
  await client.call(
    "CalendarEvent/set",
    {
      accountId,
      create: {
        e: {
          calendarIds: { [calendarId]: true },
          title,
          start: "2026-12-03T10:00:00",
          timeZone: "Europe/Berlin",
          duration: "PT1H",
        },
      },
    },
    CALENDARS,
  );
  return () =>
    client.call(
      "Calendar/set",
      { accountId, destroy: [calendarId], onDestroyRemoveEvents: true },
      CALENDARS,
    );
};

const exportCalendarTest = async (page: Page) => {
  const name = unique("Wartungen");
  const title = unique("Wartung Heizung Hoffmann");
  const remove = await calendarWithOneEvent(name, title);
  try {
    await login(page, USER);
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Kalender verwalten" }).first().click();
    const manage = page.getByRole("dialog", { name: "Kalender verwalten" });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      manage.getByRole("button", { name: `Als .ics exportieren: ${name}` }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`${name}.ics`);
    const ics = (await readFile(await download.path(), "utf8")).replace(/\r\n /g, "");
    expect(ics.match(/^BEGIN:VEVENT\r$/gm)).toHaveLength(1);
    expect(ics).toContain(`SUMMARY:${title}`);
    expect(ics).toContain("DTSTART;TZID=Europe/Berlin:20261203T100000");
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).not.toContain("METHOD:");
  } finally {
    await remove();
  }
};

test.describe("Exportieren", () => {
  test("einen Ordner mit zwei Mails als .mbox", async ({ page }) => {
    await exportFolderTest(page, false);
  });

  test("einen Ordner als .mbox am Handy @phone", async ({ page }) => {
    await exportFolderTest(page, true);
  });

  test("einen Kalender mit einem Termin als .ics", async ({ page }) => {
    await exportCalendarTest(page);
  });

  test("einen Kalender als .ics am Handy @phone", async ({ page }) => {
    await exportCalendarTest(page);
  });
});
