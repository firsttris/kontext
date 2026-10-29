import { describe, expect, it } from "vitest";
import type { StalwartRequest } from "../company/management";
import { createSubscribedCalendars } from "./calendars";

/** A Stalwart that takes every change and keeps what it was asked. */
const recording = () => {
  const asked: [string, Record<string, unknown>, string][] = [];
  const request = (async (calls: [string, Record<string, unknown>, string][]) => {
    asked.push(...calls);
    return calls.map(([method, , id]) => [method, {}, id]);
  }) as unknown as StalwartRequest;
  return { request, asked };
};

describe("createSubscribedCalendars.apply", () => {
  it("clears on an update what the file no longer has (Stalwart keeps what a patch leaves out)", async () => {
    const { request, asked } = recording();
    await createSubscribedCalendars(request).apply("d", "cal", {
      create: [],
      update: [{ id: "7", uid: "u1", event: { title: "Fest", start: "2026-11-05T10:00:00" } }],
      destroy: [],
      written: {},
    });
    const patch = (asked[0]![1].update as Record<string, Record<string, unknown>>)["7"];
    expect(patch).toMatchObject({
      title: "Fest",
      start: "2026-11-05T10:00:00",
      description: null,
      locations: null,
      virtualLocations: null,
      duration: null,
      status: null,
      freeBusyStatus: null,
    });
  });
});
