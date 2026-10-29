import { describe, expect, it } from "vitest";
import { eventsByUid, fingerprint, recurrenceIdOf, syncPlan } from "./sync-plan";

const series = {
  "@type": "Event",
  uid: "muell-1",
  start: "2026-11-05T00:00:00",
  showWithoutTime: true,
  duration: "P1D",
  title: "Restmüll",
  freeBusyStatus: "free",
  recurrenceRule: { frequency: "weekly", count: 4 },
  updated: "2026-10-01T00:00:00Z",
  iCalendar: { name: "vevent" },
};
const moved = {
  "@type": "Event",
  uid: "muell-1",
  start: "2026-11-13T00:00:00",
  showWithoutTime: true,
  duration: "P1D",
  title: "Restmüll (verschoben)",
  iCalendar: { properties: [["recurrence-id", {}, "DATE", "20261112"]], name: "vevent" },
};
const single = {
  uid: "gelb-1",
  start: "2026-11-07T00:00:00",
  title: "Gelber Sack",
  method: "publish",
};

describe("recurrenceIdOf", () => {
  it("reads RECURRENCE-ID as a local date-time, by day or with a time", () => {
    expect(recurrenceIdOf(moved)).toBe("2026-11-12T00:00:00");
    expect(
      recurrenceIdOf({
        iCalendar: { properties: [["recurrence-id", {}, "DATE-TIME", "20261112T100000Z"]] },
      }),
    ).toBe("2026-11-12T10:00:00");
    expect(recurrenceIdOf(series)).toBeUndefined();
  });
});

describe("eventsByUid", () => {
  it("makes one event per UID with the changed dates of a series in it", () => {
    const events = eventsByUid([single, series, moved]);
    expect([...events.keys()]).toEqual(["gelb-1", "muell-1"]);
    expect(events.get("muell-1")).toEqual({
      start: "2026-11-05T00:00:00",
      showWithoutTime: true,
      duration: "P1D",
      title: "Restmüll",
      freeBusyStatus: "free",
      recurrenceRule: { frequency: "weekly", count: 4 },
      recurrenceOverrides: {
        "2026-11-12T00:00:00": {
          start: "2026-11-13T00:00:00",
          showWithoutTime: true,
          duration: "P1D",
          title: "Restmüll (verschoben)",
        },
      },
    });
    expect(events.get("gelb-1")).toEqual({ start: "2026-11-07T00:00:00", title: "Gelber Sack" });
  });

  it("keeps a changed date whose series is not in the file as an event of its own", () => {
    // Stalwart's parse puts changed dates into a series that is there; one comes on its own only
    // without its series, and a feed that publishes just that date still means it.
    expect(eventsByUid([moved])).toEqual(
      new Map([
        [
          "muell-1",
          {
            start: "2026-11-13T00:00:00",
            showWithoutTime: true,
            duration: "P1D",
            title: "Restmüll (verschoben)",
          },
        ],
      ]),
    );
  });
});

describe("syncPlan", () => {
  const remote = eventsByUid([single, series, moved]);

  it("creates what is new, deletes what the file no longer has", () => {
    const plan = syncPlan(
      remote,
      [
        { id: "a", uid: "gelb-1" },
        { id: "b", uid: "alt-1" },
      ],
      { "gelb-1": fingerprint(remote.get("gelb-1")!) },
    );
    expect(plan.create.map((c) => c.uid)).toEqual(["muell-1"]);
    expect(plan.update).toEqual([]);
    expect(plan.destroy).toEqual(["b"]);
    expect(Object.keys(plan.written)).toEqual(["gelb-1", "muell-1"]);
  });

  it("updates what changed since it was written, and what was written before Kontext knew", () => {
    const changed = new Map([["gelb-1", { start: "2026-11-08T00:00:00", title: "Gelber Sack" }]]);
    const before = {
      "gelb-1": fingerprint({ start: "2026-11-07T00:00:00", title: "Gelber Sack" }),
    };
    expect(syncPlan(changed, [{ id: "a", uid: "gelb-1" }], before).update).toEqual([
      { id: "a", uid: "gelb-1", event: { start: "2026-11-08T00:00:00", title: "Gelber Sack" } },
    ]);
    expect(syncPlan(changed, [{ id: "a", uid: "gelb-1" }], {}).update).toHaveLength(1);
    const same = { "gelb-1": fingerprint(changed.get("gelb-1")!) };
    expect(syncPlan(changed, [{ id: "a", uid: "gelb-1" }], same).update).toEqual([]);
  });
});

describe("fingerprint", () => {
  it("ignores what is not synced and the order of keys", () => {
    expect(fingerprint({ title: "x", start: "s", updated: "u" })).toBe(
      fingerprint({ start: "s", title: "x" }),
    );
  });
});
