import { describe, expect, it } from "vitest";
import { handleRequest } from "./jmap";
import { seedPim } from "./pim-seed";
import { createStore, type Store } from "./store";

/** Thursday, 29 October 2026, noon in Berlin: the seed's "today". */
const NOW = Date.parse("2026-10-29T11:00:00Z");

const demo = (user: string): Store => {
  const store = { ...createStore(NOW), user };
  seedPim(store, NOW);
  return store;
};

const call = async (store: Store, name: string, args: Record<string, unknown>) =>
  (await handleRequest(store, { methodCalls: [[name, args, "0"]] })).methodResponses[0]![1];

const week = { after: "2026-10-26T00:00:00Z", before: "2026-11-23T00:00:00Z" };

const titlesBetween = async (store: Store, accountId: string) => {
  const { ids } = await call(store, "CalendarEvent/query", {
    accountId,
    filter: week,
    expandRecurrences: true,
  });
  const { list } = await call(store, "CalendarEvent/get", {
    accountId,
    ids,
    properties: ["title", "start", "baseEventId", "recurrenceId", "utcStart"],
  });
  return list as { id: string; title: string; start: string; utcStart: string }[];
};

describe("CalendarEvent/query with expandRecurrences", () => {
  it("gives every date of the weekly team meeting in the window, in the right zone", async () => {
    const meetings = (await titlesBetween(demo("jonas"), "jonas")).filter(
      (event) => event.title === "Teambesprechung",
    );
    expect(meetings.map((event) => event.start)).toEqual([
      "2026-11-01T07:30:00",
      "2026-11-08T07:30:00",
      "2026-11-15T07:30:00",
      "2026-11-22T07:30:00",
    ]);
    // 07:30 in Berlin is 06:30 UTC in November (CET).
    expect(meetings[0]!.utcStart).toBe("2026-11-01T06:30:00Z");
  });
});

describe("one date of a series", () => {
  it("moves alone, and is gone alone when deleted", async () => {
    const store = demo("jonas");
    const [first, second] = (await titlesBetween(store, "jonas")).filter(
      (event) => event.title === "Teambesprechung",
    );
    await call(store, "CalendarEvent/set", {
      accountId: "jonas",
      update: { [first!.id]: { start: "2026-11-01T09:00:00" } },
      destroy: [second!.id],
    });
    const after = (await titlesBetween(store, "jonas")).filter(
      (event) => event.title === "Teambesprechung",
    );
    expect(after.map((event) => event.start)).toEqual([
      "2026-11-01T09:00:00",
      "2026-11-15T07:30:00",
      "2026-11-22T07:30:00",
    ]);
  });
});

describe("invitations between colleagues", () => {
  it("puts the seed's meeting into Anna's calendar, and her answer reaches Jonas", async () => {
    const store = demo("anna");
    const annas = (await titlesBetween(store, "anna")).find(
      (event) => event.title === "Baubesprechung Hoffmann",
    )!;
    const { list } = await call(store, "CalendarEvent/get", {
      accountId: "anna",
      ids: [annas.id],
      properties: ["participants"],
    });
    const participants = (
      list as { participants: Record<string, { calendarAddress: string }> }[]
    )[0]!.participants;
    const [annaId] = Object.entries(participants).find(
      ([, p]) => p.calendarAddress === "mailto:anna@weber-haustechnik.test",
    )!;
    await call(store, "CalendarEvent/set", {
      accountId: "anna",
      update: { [annas.id]: { [`participants/${annaId}/participationStatus`]: "accepted" } },
    });

    const jonas = [...store.events.values()].find(
      (event) => event.accountId === "jonas" && event.uid === "baubesprechung-hoffmann",
    )!;
    const answers = jonas.participants as Record<string, { participationStatus: string }>;
    expect(answers[annaId]!.participationStatus).toBe("accepted");
  });
});

describe("Principal/getAvailability", () => {
  it("shows Anna busy at her appointment and the meeting she is invited to, without titles", async () => {
    const store = demo("jonas");
    const { list } = await call(store, "Principal/getAvailability", {
      accountId: "jonas",
      id: "anna",
      utcStart: "2026-10-29T00:00:00Z",
      utcEnd: "2026-10-30T00:00:00Z",
      eventProperties: ["id"],
    });
    const periods = (list as { utcStart: string; utcEnd: string }[]).map(
      ({ utcStart, utcEnd }) => `${utcStart}–${utcEnd}`,
    );
    expect(periods.sort()).toEqual([
      "2026-10-29T09:00:00Z–2026-10-29T10:00:00Z",
      "2026-10-29T12:30:00Z–2026-10-29T14:00:00Z",
    ]);
    expect(JSON.stringify(list)).not.toContain("Sommer");
  });
});

describe("contacts", () => {
  it("finds the cards of the address book, and a change stays", async () => {
    const store = demo("jonas");
    const { ids } = await call(store, "ContactCard/query", {
      accountId: "jonas",
      filter: { inAddressBook: "jonas-contacts" },
    });
    expect(ids).toHaveLength(11);
    const petra = "jonas-card-petra-keller";
    await call(store, "ContactCard/set", {
      accountId: "jonas",
      update: { [petra]: { "phones/p/number": "+49 7223 99999" } },
    });
    const { list } = await call(store, "ContactCard/get", { accountId: "jonas", ids: [petra] });
    expect((list as { phones: { p: { number: string } } }[])[0]!.phones.p.number).toBe(
      "+49 7223 99999",
    );
  });
});
