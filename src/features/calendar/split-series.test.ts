import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "@/lib/jscalendar";
import { useSplitSeries } from "./split-series";

const queryEvents = vi.fn();
const create = vi.fn();
const update = vi.fn();

vi.mock("@/auth/auth", () => ({ useClient: () => ({}) }));
vi.mock("@/jmap/calendar", () => ({
  queryEvents: (...args: unknown[]) => queryEvents(...args),
}));
vi.mock("./queries", () => ({
  calendarOf: () => ({ accountId: "a", calendar: { id: "c" } }),
  useCalendarRefs: () => ({ calendars: [] }),
  useEventMutations: () => ({
    create: { mutateAsync: create, isPending: false },
    update: { mutateAsync: update, isPending: false },
  }),
}));

const rule = { "@type": "RecurrenceRule" as const, frequency: "weekly" as const, count: 10 };
const series: CalendarEvent = {
  id: "s",
  accountId: "a",
  calendarIds: { c: true },
  title: "Teambesprechung",
  start: "2026-11-02T10:00:00",
  timeZone: "Europe/Berlin",
  duration: "PT1H",
  recurrenceRule: rule,
};
const instance = (recurrenceId: string, start = recurrenceId): CalendarEvent => ({
  ...series,
  id: `i-${recurrenceId}`,
  baseEventId: "s",
  recurrenceId,
  start,
  recurrenceRule: undefined,
});

beforeEach(() => {
  queryEvents.mockReset();
  create.mockReset();
  update.mockReset();
});

describe("useSplitSeries.changeFollowing", () => {
  it("counts a left-out date before the split, so the series keeps its number of dates", async () => {
    // Nov 2, 9 and 16 come before the split at Nov 23; Nov 9 is left out. RFC 8984 §4.3.3 and
    // RFC 5545 §3.8.5.3: `count` counts the dates of the rule, the excluded ones are removed after.
    const withExcluded = {
      ...series,
      recurrenceOverrides: { "2026-11-09T10:00:00": { excluded: true } },
    };
    queryEvents.mockResolvedValue([
      instance("2026-11-02T10:00:00"),
      instance("2026-11-16T10:00:00"),
    ]);
    const { result } = renderHook(() => useSplitSeries());
    await result.current.changeFollowing(instance("2026-11-23T10:00:00"), withExcluded, {
      start: "2026-11-23T10:00:00",
      recurrenceRule: rule,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ recurrenceRule: { ...rule, count: 7 } }),
      }),
    );
  });

  it("counts a date before the split that was moved past it", async () => {
    // Nov 16 was moved to Nov 24, after the split at Nov 23: it still is one of the first three.
    const moved = {
      ...series,
      recurrenceOverrides: { "2026-11-16T10:00:00": { start: "2026-11-24T10:00:00" } },
    };
    queryEvents.mockResolvedValue([
      instance("2026-11-02T10:00:00"),
      instance("2026-11-09T10:00:00"),
    ]);
    const { result } = renderHook(() => useSplitSeries());
    await result.current.changeFollowing(instance("2026-11-23T10:00:00"), moved, {
      start: "2026-11-23T10:00:00",
      recurrenceRule: rule,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ recurrenceRule: { ...rule, count: 7 } }),
      }),
    );
  });

  it("leaves the series whole when the new series cannot be created", async () => {
    queryEvents.mockResolvedValue([]);
    create.mockRejectedValue(new Error("forbidden"));
    const { result } = renderHook(() => useSplitSeries());
    await expect(
      result.current.changeFollowing(instance("2026-11-23T10:00:00"), series, {
        start: "2026-11-23T10:00:00",
        recurrenceRule: { ...rule, count: undefined },
      }),
    ).rejects.toThrow("forbidden");
    // Either the series was never cut, or it was put back as it was.
    const last = update.mock.calls.at(-1)?.[0] as { patch: Record<string, unknown> } | undefined;
    if (last) expect(last.patch.recurrenceRule).toEqual(rule);
  });
});
