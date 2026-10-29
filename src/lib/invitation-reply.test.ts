import { describe, expect, it } from "vitest";
import { replyICalendar, replyMessage } from "./invitation-reply";
import type { CalendarEvent } from "./jscalendar";

const event: CalendarEvent = {
  id: "x",
  uid: "17a9a1f6-c446@keller",
  sequence: 2,
  calendarIds: {},
  title: "Abstimmung Elektro, Neubau",
  start: "2026-11-05T10:00:00",
  timeZone: "Europe/Berlin",
  duration: "PT1H",
  organizerCalendarAddress: "mailto:petra@keller-elektro.test",
  participants: {
    p: { calendarAddress: "mailto:petra@keller-elektro.test", name: "Petra Keller" },
    j: { calendarAddress: "mailto:jonas@weber-haustechnik.test", name: "Jonas Weber" },
  },
};
const jonas = { name: "Jonas Weber", email: "jonas@weber-haustechnik.test" };
const now = new Date("2026-10-29T10:00:00Z");

describe("replyICalendar", () => {
  it("answers with UID, SEQUENCE, the organizer and only the own attendee line", () => {
    const unfolded = replyICalendar(event, jonas, "accepted", now).replace(/\r\n /g, "");
    expect(unfolded.split("\r\n")).toEqual([
      "BEGIN:VCALENDAR",
      "PRODID:-//Kontext//Kalender//DE",
      "VERSION:2.0",
      "METHOD:REPLY",
      "BEGIN:VEVENT",
      "UID:17a9a1f6-c446@keller",
      "SEQUENCE:2",
      "DTSTAMP:20261029T100000Z",
      "SUMMARY:Abstimmung Elektro\\, Neubau",
      "ORGANIZER;CN=Petra Keller:mailto:petra@keller-elektro.test",
      "ATTENDEE;CN=Jonas Weber;PARTSTAT=ACCEPTED:mailto:jonas@weber-haustechnik.test",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ]);
  });

  it("says declined and tentative as iCalendar does", () => {
    expect(replyICalendar(event, jonas, "declined", now)).toContain("PARTSTAT=DECLINED:");
    expect(replyICalendar(event, { name: null, email: jonas.email }, "tentative", now)).toContain(
      "ATTENDEE;PARTSTAT=TENTATIVE:mailto:jonas@weber-haustechnik.test",
    );
  });
});

describe("replyMessage", () => {
  it("goes from the attendee to the organizer with the REPLY as text/calendar", () => {
    const raw = replyMessage({
      event,
      attendee: jonas,
      organizer: { name: "Petra Keller", email: "petra@keller-elektro.test" },
      status: "declined",
      now,
      id: "r1",
    });
    expect(raw).toContain("From: Jonas Weber <jonas@weber-haustechnik.test>");
    expect(raw).toContain("To: Petra Keller <petra@keller-elektro.test>");
    expect(raw).toContain("Message-ID: <r1@weber-haustechnik.test>");
    expect(raw).toContain('Content-Type: multipart/alternative; boundary="reply-r1"');
    expect(raw).toContain("Content-Type: text/calendar; method=REPLY; charset=utf-8");
    const subject = raw.match(/^Subject: (.+)$/m)?.[1] ?? "";
    expect(subject.startsWith("=?UTF-8?") ? decode(subject) : subject).toBe(
      "Abgelehnt: Abstimmung Elektro, Neubau",
    );
  });
});

const decode = (word: string) =>
  word
    .split(/\s+/)
    .map((part) => Buffer.from(part.replace(/^=\?UTF-8\?B\?|\?=$/g, ""), "base64").toString())
    .join("");
