/**
 * Integration tests: the app's JMAP functions against the real, seeded Stalwart, and the
 * protocols phones and desktop programs use (IMAP, CalDAV, CardDAV). No browser involved.
 */
import { expect, test } from "@playwright/test";
import { queryEvents } from "../src/jmap/calendar";
import { CAPABILITIES } from "../src/jmap/client";
import { listAddressBooks, listContacts } from "../src/jmap/contacts";
import { getEmail, listMailboxes, queryEmails } from "../src/jmap/mail";
import { listPrincipals } from "../src/jmap/principals";
import { isGroup, membersOf } from "../src/lib/groups";
import { fullName } from "../src/lib/jscontact";
import { findRole } from "../src/lib/mailboxes";
import { jmapAs, personalAccountId } from "./helpers";
import { dav, davHome, imap } from "./protocols";

test.describe("Integration @integration", () => {
  test("JMAP: Ordner und Mails mit Anhang", async () => {
    const client = jmapAs("jonas");
    const accountId = await personalAccountId("jonas");
    const mailboxes = await listMailboxes(client, accountId);
    for (const role of ["inbox", "drafts", "sent", "trash", "junk"] as const)
      expect(findRole(mailboxes, role), role).toBeDefined();
    const inbox = findRole(mailboxes, "inbox")!;
    const page = await queryEmails(client, accountId, { mailboxId: inbox.id }, 0, 50);
    expect(page.total).toBeGreaterThan(3);
    const offer = page.emails.find((mail) => mail.subject === "Angebot Wartungsvertrag 2027")!;
    const email = await getEmail(client, accountId, offer.id);
    expect(email?.attachments?.map((part) => part.name)).toContain("Angebot-Wartung-2027.pdf");
  });

  test("JMAP: Kontakte mit Gruppe", async () => {
    const client = jmapAs("jonas");
    const accountId = await personalAccountId("jonas");
    const [book] = await listAddressBooks(client, accountId);
    const cards = await listContacts(client, accountId, book!.id);
    expect(cards.map(fullName)).toContain("Petra Keller");
    const suppliers = cards.find((card) => isGroup(card) && fullName(card) === "Lieferanten")!;
    expect(membersOf(suppliers, cards).map(fullName)).toEqual([
      "Petra Keller",
      "Bestellannahme Richter",
    ]);
  });

  test("JMAP: wiederkehrende Termine als einzelne Termine", async () => {
    const client = jmapAs("jonas");
    const session = await client.getSession();
    const accountId = session.primaryAccounts[CAPABILITIES.calendars]!;
    const now = new Date();
    const events = await queryEvents(
      client,
      accountId,
      now,
      new Date(now.getTime() + 35 * 86_400_000),
    );
    const meetings = events.filter((event) => event.title === "Teambesprechung");
    expect(meetings.length).toBeGreaterThanOrEqual(4);
    for (const meeting of meetings) expect(meeting.recurrenceId).toBeTruthy();
    expect(new Set(meetings.map((meeting) => meeting.baseEventId)).size).toBe(1);
  });

  test("JMAP: Kollegen und gemeinsame Postfächer", async () => {
    const client = jmapAs("jonas");
    const principals = await listPrincipals(client, await personalAccountId("jonas"));
    expect(principals.filter((p) => p.type === "group").map((p) => p.email)).toEqual(
      expect.arrayContaining(["info@weber-haustechnik.test", "rechnung@weber-haustechnik.test"]),
    );
    expect(principals.find((p) => p.email === "anna@weber-haustechnik.test")?.description).toBe(
      "Anna Weber",
    );
  });

  test("IMAP: das gemeinsame Postfach info@ in jedem Mailprogramm", async () => {
    const [list, select] = await imap("anna", [
      'LIST "" "*"',
      'SELECT "Shared Folders/info@weber-haustechnik.test/INBOX"',
    ]);
    expect(list).toContain('"Shared Folders/info@weber-haustechnik.test/INBOX"');
    expect(list).toContain('"Shared Folders/rechnung@weber-haustechnik.test/INBOX"');
    const exists = Number(select?.match(/\* (\d+) EXISTS/)?.[1] ?? 0);
    expect(exists).toBeGreaterThan(0);
  });

  test("IMAP: wer nicht Mitglied ist, sieht info@ nicht", async () => {
    const [list] = await imap("max", ['LIST "" "*"']);
    expect(list).not.toContain("info@weber-haustechnik.test");
  });

  test("CalDAV: Termine fürs Handy, mit Wiederholung", async () => {
    const { status, text } = await dav(
      "jonas",
      "REPORT",
      davHome("cal", "jonas"),
      `<?xml version="1.0"?><C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop><C:calendar-data/></D:prop><C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"/></C:comp-filter></C:filter></C:calendar-query>`,
    );
    expect(status).toBe(207);
    expect(text).toContain("SUMMARY:Baubesprechung Hoffmann");
    expect(text).toMatch(
      /SUMMARY:Teambesprechung[\s\S]*?RRULE:FREQ=WEEKLY;COUNT=12|RRULE:FREQ=WEEKLY;COUNT=12[\s\S]*?SUMMARY:Teambesprechung/,
    );
  });

  test("CardDAV: Kontakte und Gruppen fürs Handy", async () => {
    const { status, text } = await dav(
      "jonas",
      "REPORT",
      davHome("card", "jonas"),
      `<?xml version="1.0"?><C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><C:address-data/></D:prop></C:addressbook-query>`,
    );
    expect(status).toBe(207);
    expect(text).toContain("UID:petra-keller");
    expect(text).toMatch(/KIND:GROUP[\s\S]*?MEMBER:petra-keller/i);
  });
});
