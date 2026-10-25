// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { EmailDetail, EmailSummary } from "@/jmap/types";
import type { CalendarEvent } from "@/lib/jscalendar";
import type { ContactCard } from "@/lib/jscontact";
import type { Task } from "../tasks/tasks";
import {
  bodyText,
  clip,
  contactMatches,
  contactSummary,
  eventConcerns,
  eventSummary,
  htmlToText,
  localTime,
  mailSummary,
  newestFirst,
  taskConcerns,
  taskSummary,
} from "./format";

const card: ContactCard = {
  id: "c1",
  addressBookIds: { b: true },
  name: {
    components: [
      { kind: "given", value: "Petra" },
      { kind: "surname", value: "Hoffmann" },
    ],
  },
  organizations: { o: { name: "Hoffmann Bau GmbH" } },
  emails: {
    e1: { address: "petra@hoffmann-bau.test" },
    e2: { address: "buero@hoffmann-bau.test" },
  },
  phones: { p: { number: "0711 123456" } },
  addresses: { a: { full: "Hauptstraße 1, 70173 Stuttgart" } },
};

const summary: EmailSummary = {
  id: "m1",
  threadId: "t1",
  mailboxIds: { inbox: true },
  keywords: { $flagged: true },
  from: [{ name: "Petra Hoffmann", email: "petra@hoffmann-bau.test" }],
  to: [{ name: null, email: "info@weber-haustechnik.test" }],
  subject: "Angebot Heizung",
  receivedAt: "2026-07-01T08:30:00Z",
  preview: "Guten Tag …",
  hasAttachment: true,
  size: 1000,
};

const task = (patch: Partial<Task> = {}): Task => ({
  id: "t1",
  accountId: "a1",
  title: "Angebot schreiben",
  notes: "",
  status: "open",
  position: 0,
  assigneeId: null,
  dueDate: "2026-11-02",
  dueTime: null,
  checklist: [
    { id: "x", text: "Maße", done: true },
    { id: "y", text: "Preise", done: false },
  ],
  links: [
    {
      kind: "contact",
      accountId: "a1",
      ref: "c1",
      threadId: null,
      label: "Petra Hoffmann",
      detail: "",
    },
  ],
  createdBy: "a1",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  completedAt: null,
  assignedBy: null,
  assignedAt: null,
  remindAt: null,
  repeat: null,
  ...patch,
});

describe("what an agent reads", () => {
  it("shows times in German local time", () => {
    expect(localTime("2026-07-01T08:30:00Z")).toBe("2026-07-01 10:30");
    expect(localTime("2026-12-01T08:30:00Z")).toBe("2026-12-01 09:30");
  });

  it("says when text was cut", () => {
    expect(clip("kurz", 10)).toBe("kurz");
    expect(clip("x".repeat(20), 5)).toBe("xxxxx … [gekürzt, 20 Zeichen]");
  });

  it("turns HTML into its visible text", () => {
    const html =
      "<style>p{color:red}</style><p>Guten Tag,</p><p>anbei das Angebot&nbsp;f&uuml;r " +
      "1.000&euro;<br>Gru&#223;</p><script>alert(1)</script>";
    expect(htmlToText(html)).toBe("Guten Tag,\nanbei das Angebot für 1.000€\nGruß");
  });

  it("reads the text part, else the HTML", () => {
    const part = (partId: string) => ({
      partId,
      blobId: null,
      type: "text/plain",
      name: null,
      size: 1,
      cid: null,
      disposition: null,
    });
    const bodyValues = { "1": { value: "Hallo" }, "2": { value: "<b>Hallo</b> Welt" } };
    expect(bodyText({ textBody: [part("1")], htmlBody: [part("2")], bodyValues })).toBe("Hallo");
    expect(bodyText({ textBody: [], htmlBody: [part("2")], bodyValues })).toBe("Hallo Welt");
    expect(
      bodyText({ textBody: [], htmlBody: [], bodyValues: {} } as Pick<
        EmailDetail,
        "textBody" | "htmlBody" | "bodyValues"
      >),
    ).toBe("");
  });

  it("sums up a mail with the ids to ask further", () => {
    expect(mailSummary(summary, "a1", { a1: "info@weber-haustechnik.test" })).toEqual({
      accountId: "a1",
      account: "info@weber-haustechnik.test",
      id: "m1",
      threadId: "t1",
      received: "2026-07-01 10:30",
      from: ["Petra Hoffmann <petra@hoffmann-bau.test>"],
      to: ["info@weber-haustechnik.test"],
      subject: "Angebot Heizung",
      preview: "Guten Tag …",
      unread: true,
      flagged: true,
      hasAttachment: true,
    });
  });

  it("puts the newest mail first", () => {
    const mails = [{ received: "2026-07-01 10:30" }, { received: "2026-09-01 08:00" }];
    expect(newestFirst(mails).map((m) => m.received)).toEqual([
      "2026-09-01 08:00",
      "2026-07-01 10:30",
    ]);
  });

  it("finds a contact by name, company, any address or number, but not groups", () => {
    expect(contactMatches(card, "hoffmann")).toBe(true);
    expect(contactMatches(card, "Bau GmbH")).toBe(true);
    expect(contactMatches(card, "buero@")).toBe(true);
    expect(contactMatches(card, "123456")).toBe(true);
    expect(contactMatches(card, "Müller")).toBe(false);
    expect(contactMatches(card, " ")).toBe(false);
    expect(contactMatches({ ...card, kind: "group" }, "hoffmann")).toBe(false);
  });

  it("sums up a contact", () => {
    expect(contactSummary(card, "a1", {})).toMatchObject({
      accountId: "a1",
      account: "a1",
      name: "Petra Hoffmann",
      company: "Hoffmann Bau GmbH",
      emails: ["petra@hoffmann-bau.test", "buero@hoffmann-bau.test"],
      phones: ["0711 123456"],
      addresses: ["Hauptstraße 1, 70173 Stuttgart"],
    });
  });

  const event: CalendarEvent = {
    id: "e1",
    calendarIds: { c: true },
    title: "Termin Heizungstausch",
    start: "2026-11-03T09:00:00",
    timeZone: "Europe/Berlin",
    duration: "PT2H",
    locations: { l: { name: "Baustelle Stuttgart" } },
    participants: {
      p: { name: "Petra", calendarAddress: "mailto:petra@hoffmann-bau.test" },
    },
  };

  it("sums up an event in local time; all-day events by day", () => {
    expect(eventSummary(event, "a1", {})).toMatchObject({
      title: "Termin Heizungstausch",
      start: "2026-11-03 09:00",
      end: "2026-11-03 11:00",
      allDay: false,
      location: "Baustelle Stuttgart",
      participants: [{ name: "Petra", email: "petra@hoffmann-bau.test", status: null }],
    });
    const allDay = {
      ...event,
      start: "2026-11-03T00:00:00",
      showWithoutTime: true,
      duration: "P1D",
    };
    expect(eventSummary(allDay, "a1", {})).toMatchObject({
      start: "2026-11-03",
      end: "2026-11-03",
      allDay: true,
    });
  });

  it("knows which events concern a customer", () => {
    expect(eventConcerns(event, ["Petra@Hoffmann-Bau.test"], [])).toBe(true);
    expect(eventConcerns(event, [], ["Stuttgart"])).toBe(true);
    expect(eventConcerns(event, ["max@other.test"], ["Müller"])).toBe(false);
    // Terms of two letters would match almost anything.
    expect(eventConcerns(event, [], ["he"])).toBe(false);
  });

  it("sums up a task and finds it by what it links to", () => {
    expect(taskSummary(task(), { a1: "jonas@weber-haustechnik.test" })).toMatchObject({
      board: "jonas@weber-haustechnik.test",
      due: "2026-11-02",
      checklist: "1/2 erledigt",
      links: ["contact: Petra Hoffmann"],
      completed: null,
    });
    expect(taskConcerns(task(), ["hoffmann"])).toBe(true);
    expect(taskConcerns(task(), ["Müller"])).toBe(false);
  });
});
