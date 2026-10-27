import { describe, expect, it } from "vitest";
import type { JmapClient } from "./client";
import { saveEvent } from "./invitations";

/** A Stalwart that keeps one event and records the mails sent (decoded iCalendar parts). */
const fakeStalwart = (initial: Record<string, unknown>) => {
  let stored: Record<string, unknown> = structuredClone(initial);
  const sent: { to: string[]; ics: string }[] = [];
  let lastRaw = "";
  const client = {
    call: async (method: string, args: Record<string, unknown>) => {
      if (method === "Identity/get") {
        return {
          list: [{ id: "id1", name: "Jonas Weber", email: "jonas@weber-haustechnik.test" }],
        };
      }
      if (method === "Mailbox/get") {
        return {
          list: [
            { id: "d", name: "Drafts", role: "drafts" },
            { id: "s", name: "Sent", role: "sent" },
          ],
        };
      }
      if (method === "CalendarEvent/get") return { list: [structuredClone(stored)] };
      if (method === "CalendarEvent/set") {
        const update = args.update as Record<string, Record<string, unknown>> | undefined;
        if (update) stored = { ...stored, ...Object.values(update)[0] };
        return { updated: { [stored.id as string]: null } };
      }
      throw new Error(`unexpected ${method}`);
    },
    upload: async (_accountId: string, raw: string) => {
      lastRaw = raw;
      return { blobId: "b" };
    },
    request: async (calls: [string, Record<string, unknown>, string][]) => {
      const submission = calls[1]![1].create as Record<
        string,
        { envelope: { rcptTo: { email: string }[] } }
      >;
      const b64 = lastRaw
        .split("text/calendar; method=")[1]!
        .split("\r\n\r\n")[1]!
        .split("\r\n--")[0]!;
      sent.push({
        to: submission.send!.envelope.rcptTo.map((r) => r.email),
        ics: new TextDecoder().decode(
          Uint8Array.from(atob(b64.replace(/\r\n/g, "")), (c) => c.charCodeAt(0)),
        ),
      });
      return [
        ["Email/import", { created: { draft: { id: "m" } } }, "0"],
        ["EmailSubmission/set", { created: { send: { id: "x" } } }, "1"],
      ];
    },
  } as unknown as JmapClient;
  return { client, sent };
};

const organizer = {
  name: "Jonas Weber",
  calendarAddress: "mailto:jonas@weber-haustechnik.test",
  roles: { owner: true, attendee: true },
};
const markus = {
  calendarAddress: "mailto:markus@hoffmann.test",
  roles: { attendee: true },
  participationStatus: "needs-action",
  expectReply: true,
};

const event = {
  id: "e1",
  uid: "uid-1",
  sequence: 0,
  calendarIds: { c: true },
  title: "Abnahme",
  start: "2026-11-20T15:00:00",
  timeZone: "Europe/Berlin",
  duration: "PT1H",
  organizerCalendarAddress: "mailto:jonas@weber-haustechnik.test",
  participants: { o: organizer, k: markus },
};

const sequenceOf = (ics: string) => Number(ics.match(/\r\nSEQUENCE:(\d+)\r\n/)![1]);
const methodOf = (ics: string) => ics.match(/\r\nMETHOD:(\w+)\r\n/)![1];

describe("saveEvent", () => {
  it("re-invites with a SEQUENCE not below the CANCEL the attendee already has", async () => {
    const { client, sent } = fakeStalwart(event);
    const now = () => new Date("2026-10-27T12:00:00Z");
    const noLinks = async () => ({});
    // Taken off (by mistake) ...
    await saveEvent(
      client,
      "a",
      { kind: "update", id: "e1", patch: { participants: { o: organizer } } },
      noLinks,
      now,
    );
    // ... and added back.
    await saveEvent(
      client,
      "a",
      { kind: "update", id: "e1", patch: { participants: { o: organizer, k: markus } } },
      noLinks,
      now,
    );

    expect(sent.map((mail) => methodOf(mail.ics))).toEqual(["CANCEL", "REQUEST"]);
    const [cancel, request] = sent.map((mail) => sequenceOf(mail.ics));
    // RFC 5546 §2.1.4/§2.1.5: a recipient (Stalwart inbound.rs: ItipError::OutOfSequence) ignores
    // a REQUEST whose SEQUENCE is below the one it already holds.
    expect(request).toBeGreaterThanOrEqual(cancel!);
  });
});
