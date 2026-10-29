import { type Browser, expect, type Page, test } from "@playwright/test";
import { assertSetOk } from "../src/jmap/client";
import { addAttendees, address, jmapAs, login, personalAccountId, unique } from "./helpers";

/** Invitations go out only for events to come. */
const tomorrow = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    new Date(Date.now() + 86_400_000),
  );

const CUSTOMER = "markus.hoffmann@hoffmann-bau.test";

type Part = { partId?: string; type: string; subParts?: Part[] };
type Sent = { subject: string; to: string; html: string; calendar: string };

const partsOf = (part: Part): Part[] => [part, ...(part.subParts ?? []).flatMap(partsOf)];

/** The mails in a user's Sent folder whose subject has the text, with HTML and iCalendar. */
const sentMails = async (user: string, text: string): Promise<Sent[]> => {
  const client = jmapAs(user);
  const accountId = await personalAccountId(user);
  const { list: boxes } = await client.call<{ list: { id: string; role: string | null }[] }>(
    "Mailbox/get",
    { accountId, properties: ["role"] },
  );
  const sent = boxes.find((box) => box.role === "sent")!.id;
  const [, get] = await client.request([
    ["Email/query", { accountId, filter: { inMailbox: sent, subject: text } }, "q"],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: ["subject", "to", "bodyStructure", "bodyValues"],
        fetchAllBodyValues: true,
      },
      "g",
    ],
  ]);
  const list = get![1].list as {
    subject: string;
    to: { email: string }[];
    bodyStructure: Part;
    bodyValues: Record<string, { value: string }>;
  }[];
  return list.map((mail) => {
    const parts = partsOf(mail.bodyStructure);
    const value = (type: string) =>
      mail.bodyValues[parts.find((part) => part.type === type)?.partId ?? ""]?.value ?? "";
    return {
      subject: mail.subject,
      to: mail.to[0]?.email ?? "",
      html: value("text/html"),
      calendar: value("text/calendar"),
    };
  });
};

/** The invitation to someone, once it is in Sent. */
const sentTo = async (subject: string, to: string): Promise<Sent> => {
  let found: Sent | undefined;
  await expect
    .poll(
      async () => {
        found = (await sentMails("jonas", subject)).find(
          (mail) => mail.subject === subject && mail.to === to,
        );
        return Boolean(found);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return found!;
};

/** The answer page for "Ja", "Nein" or "Vielleicht", as the link in the mail has it. */
const answerLink = (mail: Sent, answer: "accepted" | "declined" | "tentative") => {
  const link = mail.html.match(new RegExp(`href="([^"]*/rsvp\\?t=[^"]*r=${answer})"`))?.[1];
  if (!link) throw new Error("Kein Antwort-Link in der Einladung");
  return link.replace(/&amp;/g, "&");
};

/** A browser of someone outside: no Kontext session. */
const outsider = async (browser: Browser, phone = false) =>
  (
    await browser.newContext({
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
      ...(phone ? { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true } : {}),
    })
  ).newPage();

const createWithAttendees = async (page: Page, title: string, attendees: string) => {
  await page.goto(`/calendar?date=${tomorrow()}&event=new&start=${tomorrow()}T14:00`);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titel").fill(title);
  await dialog.getByLabel("Ort").fill("Hauptstraße 41, Ettlingen");
  await addAttendees(dialog, attendees);
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("status")).toHaveText("Einladungen werden verschickt.");
};

/** Opens a mail in the inbox once it is there (Stalwart delivers invitations within seconds). */
const openMail = async (page: Page, subject: string) => {
  await expect
    .poll(
      async () => {
        await page.goto("/mail");
        return page
          .getByText(subject)
          .first()
          .waitFor({ timeout: 2_000 })
          .then(() => true)
          .catch(() => false);
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await page.getByText(subject).first().click();
};

/** Jonas's view of whom he invited, as the event's dialog lists them. */
const attendeesOf = async (page: Page, title: string) => {
  await page.goto(`/calendar?date=${tomorrow()}`);
  await page.locator(`[data-day="${tomorrow()}"]`).getByText(title).click();
  const text = (await page.getByRole("list", { name: "Teilnehmer" }).textContent()) ?? "";
  await page.keyboard.press("Escape");
  return text;
};

/**
 * An invitation from someone outside, straight into Anna's inbox (Email/import, so Stalwart
 * doesn't put it into her calendar, as for a sender it doesn't know): iCalendar as mail programs
 * send it, in multipart/alternative with METHOD:REQUEST.
 */
const outsideInvitation = async (title: string) => {
  const uid = `${Date.now().toString(36)}@hoffmann-bau.test`;
  const day = tomorrow().replace(/-/g, "");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hoffmann Bau//Test//DE",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "SEQUENCE:0",
    "DTSTAMP:20260101T000000Z",
    `DTSTART;TZID=Europe/Berlin:${day}T090000`,
    `DTEND;TZID=Europe/Berlin:${day}T100000`,
    `SUMMARY:${title}`,
    "LOCATION:Baustelle Weingarten",
    `ORGANIZER;CN=Markus Hoffmann:mailto:${CUSTOMER}`,
    `ATTENDEE;CN=Markus Hoffmann;PARTSTAT=ACCEPTED:mailto:${CUSTOMER}`,
    `ATTENDEE;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${address("anna")}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  const raw = [
    `From: Markus Hoffmann <${CUSTOMER}>`,
    `To: ${address("anna")}`,
    `Subject: Einladung: ${title}`,
    "MIME-Version: 1.0",
    `Message-ID: <${uid}>`,
    `Date: ${new Date().toUTCString()}`,
    'Content-Type: multipart/alternative; boundary="b"',
    "",
    "--b",
    "Content-Type: text/plain; charset=utf-8",
    "",
    `Einladung zu ${title}`,
    "--b",
    "Content-Type: text/calendar; charset=utf-8; method=REQUEST",
    "",
    ics,
    "--b--",
    "",
  ].join("\r\n");
  const client = jmapAs("anna");
  const accountId = await personalAccountId("anna");
  const { list } = await client.call<{ list: { id: string; role: string | null }[] }>(
    "Mailbox/get",
    { accountId, properties: ["role"] },
  );
  const inbox = list.find((box) => box.role === "inbox")!.id;
  const { blobId } = await client.upload(accountId, raw, "message/rfc822");
  const result = await client.call("Email/import", {
    accountId,
    emails: { m: { blobId, mailboxIds: { [inbox]: true }, receivedAt: new Date().toISOString() } },
  });
  assertSetOk(result, "Email/import");
};

test.describe("Einladungen", () => {
  test("Kontext lädt ein, Kunde sagt per Klick zu, Absage geht an alle", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const title = unique("Abnahme Heizung");
    await login(page);
    await createWithAttendees(page, title, `${address("anna")}, ${CUSTOMER}`);

    // Both get Kontext's mail in Jonas's name, with the calendar part for their programs.
    const toCustomer = await sentTo(`Einladung: ${title}`, CUSTOMER);
    expect(toCustomer.html).toContain("Jonas Weber lädt dich ein");
    expect(toCustomer.calendar).toContain("METHOD:REQUEST");
    expect(toCustomer.calendar.replace(/\r?\n /g, "")).toContain(
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${CUSTOMER}`,
    );
    await sentTo(`Einladung: ${title}`, address("anna"));

    // Anna reads it in Kontext, and Stalwart put the event into her calendar from it.
    const anna = await outsider(browser);
    await login(anna, "anna");
    await openMail(anna, `Einladung: ${title}`);
    const body = anna.frameLocator("iframe[title='Inhalt der Mail']");
    await expect(body.getByText("Jonas Weber lädt dich ein")).toBeVisible();
    await expect(body.getByRole("link", { name: "Ja", exact: true })).toBeVisible();
    await expect(body.getByRole("link", { name: "Vielleicht" })).toBeVisible();
    await anna.goto(`/calendar?date=${tomorrow()}`);
    await expect(anna.locator(`[data-day="${tomorrow()}"]`).getByText(title)).toBeVisible();

    // The customer clicks "Ja": no account, the answer goes into Jonas's event.
    const customer = await outsider(browser);
    await customer.goto(answerLink(toCustomer, "accepted"));
    await expect(customer.getByRole("status")).toHaveText("Du hast zugesagt.");
    await expect(customer.getByRole("heading", { name: title })).toBeVisible();
    await expect(customer.getByText("Einladung von Jonas Weber")).toBeVisible();
    await expect
      .poll(() => attendeesOf(page, title), { timeout: 20_000 })
      .toMatch(new RegExp(`${CUSTOMER.replace(/\./g, "\\.")}\\s*zugesagt`));

    // Jonas calls it off: a CANCEL to both.
    await page.locator(`[data-day="${tomorrow()}"]`).getByText(title).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Termin löschen", exact: true })
      .click();
    const cancel = await sentTo(`Abgesagt: ${title}`, CUSTOMER);
    expect(cancel.html).toContain("Jonas Weber hat den Termin abgesagt");
    expect(cancel.html).not.toContain("/rsvp?");
    expect(cancel.calendar).toContain("METHOD:CANCEL");
    expect(cancel.calendar).toContain("STATUS:CANCELLED");
    await sentTo(`Abgesagt: ${title}`, address("anna"));

    // The answer page knows the event is gone.
    await customer.goto(answerLink(toCustomer, "declined"));
    await expect(customer.getByRole("alert")).toHaveText("Diesen Termin gibt es nicht mehr.");
  });

  test("Geänderter Termin: neue Einladung mit höherer SEQUENCE, Ausgeladene bekommen CANCEL", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const title = unique("Wartung Therme");
    await login(page);
    await createWithAttendees(page, title, `${CUSTOMER}, ${address("max")}`);
    const first = await sentTo(`Einladung: ${title}`, CUSTOMER);
    expect(first.calendar).toContain("SEQUENCE:0");

    await page.locator(`[data-day="${tomorrow()}"]`).getByText(title).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Bearbeiten" }).click();
    await dialog.getByLabel("Ort").fill("Baustelle Weingarten");
    await dialog.getByRole("button", { name: `${address("max")} entfernen` }).click();
    await dialog.getByRole("button", { name: "Speichern" }).click();

    const changed = await sentTo(`Geändert: ${title}`, CUSTOMER);
    expect(changed.html).toContain("Jonas Weber hat den Termin geändert");
    expect(changed.html).toContain("Baustelle Weingarten");
    expect(changed.calendar).toContain("SEQUENCE:1");
    const removed = await sentTo(`Abgesagt: ${title}`, address("max"));
    expect(removed.calendar).toContain("METHOD:CANCEL");
    expect(removed.calendar.replace(/\r?\n /g, "")).not.toContain(`mailto:${CUSTOMER}`);
  });

  test("Kollegin sagt direkt in der Mail zu, Jonas sieht die Antwort", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const title = unique("Montage Wärmepumpe");
    await login(page);
    await createWithAttendees(page, title, address("anna"));

    const anna = await outsider(browser);
    await login(anna, "anna");
    await openMail(anna, `Einladung: ${title}`);
    const card = anna.getByRole("region", { name: "Einladung" });
    await expect(card.getByText("Einladung von Jonas Weber")).toBeVisible();
    await expect(card.getByText(title)).toBeVisible();
    await expect(card.getByRole("status")).toHaveText("Du hast noch nicht geantwortet.");
    await card.getByRole("button", { name: "Vielleicht" }).click();
    await expect(card.getByRole("status")).toHaveText("Du hast mit „Vielleicht“ geantwortet.");
    await expect(card.getByRole("button", { name: "Vielleicht" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // The calendar part is the card now, not an attachment of its own; invite.ics stays.
    await expect(anna.getByRole("list", { name: "Anhänge" }).getByRole("listitem")).toHaveCount(1);

    await expect
      .poll(() => attendeesOf(page, title), { timeout: 20_000 })
      .toMatch(/anna@weber-haustechnik\.test\s*vielleicht/);

    await card.getByRole("link", { name: "Im Kalender öffnen" }).click();
    await expect(anna.getByRole("dialog").getByRole("heading", { name: title })).toBeVisible();
  });
});

test.describe("Einladungen am Handy @phone", () => {
  test("Antwort auf der Seite der Einladung, dann geändert", async ({ page, browser }) => {
    test.setTimeout(90_000);
    const title = unique("Beratung Bad");
    await login(page);
    await createWithAttendees(page, title, CUSTOMER);
    const mail = await sentTo(`Einladung: ${title}`, CUSTOMER);

    const customer = await outsider(browser, true);
    await customer.goto(answerLink(mail, "declined"));
    await expect(customer.getByRole("status")).toHaveText("Du hast abgesagt.");
    await expect(customer.getByText("Hauptstraße 41, Ettlingen")).toBeVisible();
    await customer.getByRole("button", { name: "Vielleicht" }).click();
    await expect(customer.getByRole("status")).toHaveText("Du hast mit „Vielleicht“ geantwortet.");
    await expect(customer.getByRole("button", { name: "Vielleicht" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await customer.goto("/rsvp?t=kaputt&r=accepted");
    await expect(customer.getByRole("alert")).toHaveText(
      "Dieser Link ist ungültig oder abgelaufen.",
    );
  });

  test("Einladung von außen: in der Mail zusagen trägt den Termin ein", async ({ page }) => {
    test.setTimeout(90_000);
    const title = unique("Baubesprechung Hoffmann");
    await outsideInvitation(title);
    await login(page, "anna");
    await openMail(page, `Einladung: ${title}`);
    const card = page.getByRole("region", { name: "Einladung" });
    await expect(card.getByText("Einladung von Markus Hoffmann")).toBeVisible();
    await expect(card.getByText("Baustelle Weingarten")).toBeVisible();
    await expect(card.getByRole("status")).toHaveText(
      "Noch nicht in deinem Kalender – mit deiner Antwort wird der Termin eingetragen.",
    );
    await card.getByRole("button", { name: "Zusagen" }).click();
    await expect(card.getByRole("status")).toHaveText("Du hast zugesagt.");

    await card.getByRole("link", { name: "Im Kalender öffnen" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: title })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Zusagen" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
