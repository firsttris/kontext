import { describe, expect, it } from "vitest";
import { createCalendars } from "./calendars";
import type { StalwartRequest } from "./management";

/** Like Stalwart: at most 16 calls per request (`maxMethodCalls`), else `limit.calls-in`. */
const stalwartLike = (fail?: string) => {
  const requests: number[] = [];
  const request = (async (calls) => {
    if (fail) throw new Error(fail);
    if (calls.length > 16) throw new Error("Stalwart-Verwaltung: 400 (limit.calls-in)");
    requests.push(calls.length);
    return calls.map(([method, , id]) =>
      method === "Calendar/get"
        ? [method, { list: [{ id: "cal", shareWith: null }] }, id]
        : [method, { updated: { cal: null } }, id],
    );
  }) as StalwartRequest;
  return { request, requests };
};

const people = Array.from({ length: 40 }, (_, i) => `p${i}`);

describe("the company's calendars", () => {
  it("splits the calls for a large company into requests Stalwart accepts", async () => {
    const { request, requests } = stalwartLike();
    const calendars = createCalendars(request);
    expect(await calendars.showEveryone(people)).toEqual({ ok: true, value: 40 });
    expect(Math.max(...requests)).toBeLessThanOrEqual(16);
    expect(await calendars.welcome("p39", people)).toMatchObject({ ok: true });
  });

  it("reports a refusal as an error instead of throwing", async () => {
    const calendars = createCalendars(stalwartLike("Stalwart-Verwaltung: 503").request);
    expect(await calendars.welcome("p1", ["p0", "p1"])).toEqual({
      ok: false,
      error: "Kalender: Stalwart-Verwaltung: 503",
    });
  });
});
