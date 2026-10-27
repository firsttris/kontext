// @vitest-environment node
import PostalMime from "postal-mime";
import { describe, expect, it } from "vitest";
import { eventWhen } from "./event-when";
import {
  type InvitationMail,
  invitationHtml,
  invitationMessage,
  invitationText,
} from "./invitation-mail";
import type { CalendarEvent } from "./jscalendar";

const event: CalendarEvent = {
  id: "e1",
  uid: "u1",
  calendarIds: { b: true },
  title: "Abnahme <Bad>",
  description: "Bitte Muster mitbringen.",
  start: "2026-11-20T15:00:00",
  timeZone: "Europe/Berlin",
  duration: "PT1H30M",
  locations: { l: { name: "Hauptstraße 41" } },
  virtualLocations: {
    v: { name: "Videobesprechung", uri: "https://kontext.firma.de/meet/abcdefghijklmnop" },
    x: { uri: "javascript:alert(1)" },
  },
  organizerCalendarAddress: "mailto:jonas@weber-haustechnik.test",
  participants: {
    o: {
      name: "Jonas Weber",
      calendarAddress: "mailto:jonas@weber-haustechnik.test",
      roles: { owner: true, attendee: true },
    },
    k: { calendarAddress: "mailto:markus@hoffmann.test", roles: { attendee: true } },
  },
};

const LINKS = {
  accepted: "https://kontext.firma.de/rsvp?t=abc&r=accepted",
  declined: "https://kontext.firma.de/rsvp?t=abc&r=declined",
  tentative: "https://kontext.firma.de/rsvp?t=abc&r=tentative",
};

const mail = (extra: Partial<InvitationMail> = {}): InvitationMail => ({
  kind: "invite",
  event,
  organizer: { name: "Jonas Weber", email: "jonas@weber-haustechnik.test" },
  recipient: { name: null, email: "markus@hoffmann.test" },
  links: LINKS,
  now: new Date("2026-10-27T12:00:00Z"),
  id: "m1",
  ...extra,
});

describe("eventWhen", () => {
  it("says the time in the event's zone and names it", () => {
    expect(eventWhen(event)).toBe(
      "Freitag, 20. November 2026, 15:00–16:30 Uhr (Mitteleuropäische Normalzeit)",
    );
    expect(
      eventWhen({ ...event, start: "2026-07-03T09:00:00", timeZone: "America/New_York" }),
    ).toBe("Freitag, 3. Juli 2026, 09:00–10:30 Uhr (Nordamerikanische Ostküsten-Sommerzeit)");
  });

  it("says whole days for all-day events", () => {
    expect(
      eventWhen({ ...event, start: "2026-12-24T00:00:00", duration: "P1D", showWithoutTime: true }),
    ).toBe("Donnerstag, 24. Dezember 2026, ganztägig");
    expect(
      eventWhen({ ...event, start: "2026-12-24T00:00:00", duration: "P3D", showWithoutTime: true }),
    ).toBe("Donnerstag, 24. Dezember 2026 bis Samstag, 26. Dezember 2026, ganztägig");
  });
});

describe("invitation mail", () => {
  it("shows the event in Kontext's look with the three answers", () => {
    const html = invitationHtml(mail());
    expect(html).toContain("Jonas Weber lädt dich ein");
    expect(html).toContain("Abnahme &lt;Bad&gt;");
    expect(html).toContain("Hauptstraße 41");
    expect(html).toContain('href="https://kontext.firma.de/meet/abcdefghijklmnop"');
    expect(html).not.toContain("javascript:");
    expect(html).toContain("Jonas Weber (Organisator)<br>markus@hoffmann.test");
    expect(html).toContain(`href="${LINKS.accepted.replace(/&/g, "&amp;")}"`);
    expect(html).toMatch(/>Ja<\/a>.*>Nein<\/a>.*>Vielleicht<\/a>/s);
    expect(html).toContain("#18181b");
  });

  it("goes without buttons when there are no links, and for a cancellation", () => {
    expect(invitationHtml(mail({ links: null }))).not.toContain("rsvp?");
    const cancel = invitationHtml(mail({ kind: "cancel" }));
    expect(cancel).toContain("Jonas Weber hat den Termin abgesagt");
    expect(cancel).not.toContain("rsvp?");
    expect(invitationHtml(mail({ kind: "update" }))).toContain("hat den Termin geändert");
  });

  it("has the same as text", () => {
    const text = invitationText(mail());
    expect(text).toContain("Wann: Freitag, 20. November 2026, 15:00–16:30 Uhr");
    expect(text).toContain(`Ja: ${LINKS.accepted}`);
    expect(text).toContain("Notiz: Bitte Muster mitbringen.");
  });

  it("is a mail with text, HTML and the calendar part with its method", async () => {
    const parsed = await PostalMime.parse(invitationMessage(mail()));
    expect(parsed.subject).toBe("Einladung: Abnahme <Bad>");
    expect(parsed.from).toMatchObject({
      name: "Jonas Weber",
      address: "jonas@weber-haustechnik.test",
    });
    expect(parsed.to?.[0]).toMatchObject({ address: "markus@hoffmann.test" });
    expect(parsed.messageId).toBe("<m1@weber-haustechnik.test>");
    expect(parsed.html).toContain("lädt dich ein");
    expect(parsed.text).toContain("Nimmst du teil?");
    const raw = invitationMessage(mail());
    expect(raw).toContain("Content-Type: text/calendar; method=REQUEST; charset=utf-8");
    const file = parsed.attachments.find((part) => part.filename === "invite.ics");
    expect(file?.mimeType).toBe("application/ics");
    const ics = new TextDecoder().decode(file!.content as ArrayBuffer);
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("UID:u1");
  });

  it("cancels for the one taken off alone", async () => {
    const raw = invitationMessage(mail({ kind: "removed" }));
    expect(raw).toContain("Content-Type: text/calendar; method=CANCEL; charset=utf-8");
    const parsed = await PostalMime.parse(raw);
    expect(parsed.subject).toBe("Abgesagt: Abnahme <Bad>");
    const ics = new TextDecoder().decode(
      parsed.attachments.find((part) => part.filename === "invite.ics")!.content as ArrayBuffer,
    );
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics.replace(/\r?\n /g, "")).toContain("mailto:markus@hoffmann.test");
    expect(ics).not.toContain("javascript:");
  });
});
