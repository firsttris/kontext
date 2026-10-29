import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/lib/jscalendar";
import type { ParsedEvent } from "@/lib/mail-invitation";
import type { JmapClient } from "./client";
import { answerInvitation, removeCancelled } from "./mail-invitations";

/** A Stalwart that records CalendarEvent/set calls and the raw mails uploaded. */
const fakeStalwart = () => {
  const sets: Record<string, unknown>[] = [];
  const uploads: string[] = [];
  const client = {
    call: async (method: string, args: Record<string, unknown>) => {
      if (method === "Mailbox/get") {
        return {
          list: [
            { id: "d", name: "Drafts", role: "drafts" },
            { id: "s", name: "Sent", role: "sent" },
          ],
        };
      }
      if (method === "CalendarEvent/set") {
        sets.push(args);
        return {
          created: { e: { id: "new" } },
          updated: { series: null },
          destroyed: (args.destroy as string[] | undefined) ?? [],
        };
      }
      throw new Error(`unexpected ${method}`);
    },
    upload: async (_accountId: string, raw: string) => {
      uploads.push(raw);
      return { blobId: "b" };
    },
    request: async () => [
      ["Email/import", { created: { draft: { id: "m" } } }, "0"],
      ["EmailSubmission/set", { created: { send: { id: "x" } } }, "1"],
    ],
  } as unknown as JmapClient;
  return { client, sets, uploads };
};

const participants = {
  p: {
    calendarAddress: "mailto:petra@keller-elektro.test",
    name: "Petra Keller",
    roles: { owner: true },
  },
  j: {
    calendarAddress: "mailto:jonas@weber-haustechnik.test",
    participationStatus: "needs-action",
  },
} as CalendarEvent["participants"];

const series: CalendarEvent = {
  id: "series",
  uid: "series-1@keller.test",
  sequence: 0,
  calendarIds: { c: true },
  title: "Jour fixe",
  start: "2026-11-05T10:00:00",
  timeZone: "Europe/Berlin",
  duration: "PT1H",
  recurrenceRule: { "@type": "RecurrenceRule", frequency: "weekly" },
  organizerCalendarAddress: "mailto:petra@keller-elektro.test",
  participants,
} as CalendarEvent;

const identities = [
  { id: "id1", name: "Jonas Weber", email: "jonas@weber-haustechnik.test" },
] as Parameters<typeof answerInvitation>[1]["identities"];

describe("removeCancelled", () => {
  it("takes out only the called-off date of a series, not the whole series", async () => {
    // Stalwart's CalendarEvent/parse of a CANCEL with RECURRENCE-ID (checked on 0.16.27).
    const cancel: ParsedEvent = {
      ...series,
      id: "",
      sequence: 1,
      start: "2026-11-12T10:00:00",
      recurrenceRule: null,
      recurrenceId: "2026-11-12T10:00:00",
      status: "cancelled",
      method: "cancel",
    } as ParsedEvent;
    const { client, sets } = fakeStalwart();
    const moved = { "2026-11-19T10:00:00": { start: "2026-11-19T11:00:00" } };
    await removeCancelled(client, "a", { ...series, recurrenceOverrides: moved }, cancel);
    expect(sets).toHaveLength(1);
    expect(sets[0]!.destroy).toBeUndefined();
    // The whole map: Stalwart refuses a patch path into overrides that are not there yet.
    expect(sets[0]!.update).toEqual({
      series: {
        recurrenceOverrides: { ...moved, "2026-11-12T10:00:00": { excluded: true } },
      },
    });
  });

  it("takes out a single event or a whole cancelled series", async () => {
    const { client, sets } = fakeStalwart();
    await removeCancelled(client, "a", series, { ...series, method: "cancel" });
    expect(sets[0]!.destroy).toEqual(["series"]);
  });
});

describe("answerInvitation", () => {
  it("takes over the new time of an updated invitation and replies to its SEQUENCE", async () => {
    const update: ParsedEvent = {
      ...series,
      id: "",
      sequence: 2,
      start: "2026-11-05T14:00:00",
      method: "request",
    };
    const { client, sets, uploads } = fakeStalwart();
    await answerInvitation(client, {
      accountId: "a",
      calendarId: "c",
      parsed: update,
      stored: series,
      status: "accepted",
      identities,
      now: new Date("2026-10-29T10:00:00Z"),
    });
    const patch = (sets[0]!.update as Record<string, Record<string, unknown>>).series!;
    expect(patch.start).toBe("2026-11-05T14:00:00");
    expect(patch.sequence).toBe(2);
    const ics = atob(
      uploads[0]!
        .split("text/calendar; method=REPLY")[1]!
        .split("\r\n\r\n")[1]!
        .split("\r\n--")[0]!
        .replace(/\r\n/g, ""),
    );
    expect(ics).toContain("SEQUENCE:2");
  });
});
