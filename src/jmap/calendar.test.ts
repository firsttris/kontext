import { describe, expect, it } from "vitest";
import { eventTimes, toLocal } from "@/lib/jscalendar";
import { getEvent, getStoredEvent, queryEvents } from "./calendar";
import type { JmapClient } from "./client";

/**
 * A floating all-day series (weekly from 2028-05-01) whose second date was moved to a time of
 * day, as Stalwart 0.16.27 returns it (checked against a running server).
 */
const instances = [
  {
    id: "i1",
    start: "2028-05-01T00:00:00",
    timeZone: "Europe/Berlin",
    duration: "P1D",
    recurrenceId: "2028-05-01T00:00:00",
    baseEventId: "c",
  },
  {
    id: "i2",
    start: "2028-05-08T00:00:00",
    timeZone: "Europe/Berlin",
    duration: "PT1H",
    showWithoutTime: false,
    baseEventId: "c",
  },
];
const series = { id: "c", start: "2028-05-01T00:00:00", duration: "P1D", showWithoutTime: true };
/** What get on the series' id returns once a date is changed: the changed date's values. */
const overrideAsSeries = {
  id: "c",
  start: "2028-05-08T00:00:00",
  duration: "PT1H",
  showWithoutTime: false,
};

const stalwart = {
  call: async (method: string, args: Record<string, unknown>) => {
    if (method === "CalendarEvent/query") return { ids: ["i1", "i2"] };
    const ids = args.ids as string[];
    if (ids.includes("i1")) return { list: instances };
    return { list: ["recurrenceOverridesAfter" in args ? series : overrideAsSeries] };
  },
} as unknown as JmapClient;

describe("queryEvents", () => {
  it("keeps the other dates of an all-day series all-day when one date has a time", async () => {
    const events = await queryEvents(stalwart, "a", new Date("2028-04-28"), new Date("2028-05-30"));
    const shown = events.map((event) => {
      const { start, end, allDay } = eventTimes(event);
      return [toLocal(start), toLocal(end), allDay];
    });
    expect(shown).toEqual([
      ["2028-05-01T00:00:00", "2028-05-02T00:00:00", true],
      ["2028-05-08T00:00:00", "2028-05-08T01:00:00", false],
    ]);
  });
});

/**
 * Stalwart 1.0.1's checks (crates/jmap/src/calendar_event/get.rs and query.rs): no
 * recurrenceOverrides with utcStart/utcEnd, no expanded query over maxExpandedQueryDuration.
 */
const MAX_EXPAND_MS = 365 * 86_400_000;
const strictStalwart = (onQuery: (after: string, before: string) => string[] = () => ["e"]) => {
  const queries: [string, string][] = [];
  const client = {
    call: async (method: string, args: Record<string, unknown>) => {
      if (method === "CalendarEvent/query") {
        const { after, before } = args.filter as { after: string; before: string };
        if (Date.parse(before) - Date.parse(after) > MAX_EXPAND_MS)
          throw new Error(
            "The time span between 'after' and 'before' exceeds maxExpandedQueryDuration",
          );
        queries.push([after, before]);
        return { ids: onQuery(after, before) };
      }
      const properties = (args.properties as string[] | undefined) ?? [];
      if (
        properties.includes("recurrenceOverrides") &&
        (properties.includes("utcStart") || properties.includes("utcEnd"))
      )
        throw new Error("recurrenceOverrides cannot be requested together with utcStart or utcEnd");
      return {
        list: (args.ids as string[]).map((id) => ({
          id,
          start: "2026-11-02T09:00:00",
          duration: "PT1H",
        })),
      };
    },
  } as unknown as JmapClient;
  return { client, queries };
};

describe("queryEvents against Stalwart 1.0", () => {
  it("asks for the instances without recurrenceOverrides", async () => {
    const { client } = strictStalwart();
    const events = await queryEvents(client, "a", new Date("2026-11-01"), new Date("2026-11-08"));
    expect(events.map((event) => event.id)).toEqual(["e"]);
  });

  it("splits a span longer than maxExpandedQueryDuration and keeps each event once", async () => {
    const { client, queries } = strictStalwart((after) =>
      after.startsWith("2026") ? ["a", "both"] : ["both", "b"],
    );
    const events = await queryEvents(client, "a", new Date("2026-01-01"), new Date("2028-01-01"));
    expect(events.map((event) => event.id)).toEqual(["a", "both", "b"]);
    expect(queries.length).toBeGreaterThan(1);
    expect(queries[0]![0]).toBe("2026-01-01T00:00:00Z");
    expect(queries.at(-1)![1]).toBe("2028-01-01T00:00:00Z");
  });
});

describe("getEvent and getStoredEvent against Stalwart 1.0", () => {
  it("ask for the series with its recurrenceOverrides, without utcStart and utcEnd", async () => {
    const { client } = strictStalwart();
    expect((await getEvent(client, "a", "s"))?.id).toBe("s");
    expect((await getStoredEvent(client, "a", "s"))?.id).toBe("s");
  });
});
