import { describe, expect, it } from "vitest";
import { eventTimes, toLocal } from "@/lib/jscalendar";
import { queryEvents } from "./calendar";
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
