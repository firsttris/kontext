import { describe, expect, it } from "vitest";
import { incomingCall, type PhoneCall } from "./phone";
import { berlinSlot, callStats } from "./stats";

const call = (startedAt: string, extra: Partial<PhoneCall> = {}): PhoneCall => ({
  ...incomingCall(
    {
      type: "event",
      seq: 1,
      call: startedAt,
      state: "ringing",
      direction: "in",
      remote: "07223 123456",
      local: "",
      at: startedAt,
    },
    { id: startedAt, boxId: "b", members: ["jonas", "anna"] },
  ),
  state: "ended",
  ...extra,
});

describe("call statistics", () => {
  const now = new Date("2026-10-25T12:00:00.000Z");

  it("puts an instant into Berlin's weekday and hour", () => {
    // Monday 26 Oct 2026, 08:15 UTC = 09:15 in Berlin (winter time).
    expect(berlinSlot("2026-10-26T08:15:00.000Z")).toEqual({ day: 0, hour: 9 });
    expect(berlinSlot("2026-10-25T00:30:00.000Z")).toEqual({ day: 6, hour: 2 });
  });

  it("counts calls, how fast they were answered, when they were missed and who took them", () => {
    const stats = callStats(
      [
        call("2026-10-23T08:00:00.000Z", {
          outcome: "answered",
          answeredAt: "2026-10-23T08:00:10.000Z",
          member: "anna",
        }),
        call("2026-10-23T09:00:00.000Z", {
          outcome: "answered",
          answeredAt: "2026-10-23T09:00:20.000Z",
          member: "anna",
        }),
        call("2026-10-22T07:30:00.000Z", { outcome: "missed", voicemailSeconds: 12 }),
        call("2026-10-24T18:00:00.000Z", { outcome: "closed" }),
        call("2026-10-24T18:05:00.000Z", { outcome: "blocked" }),
        call("2026-10-24T10:00:00.000Z", { direction: "out", outcome: "answered" }),
        call("2026-09-01T10:00:00.000Z", { outcome: "missed" }),
      ],
      now,
      30,
    );
    expect(stats).toMatchObject({
      incoming: 4,
      answered: 2,
      missed: 1,
      closed: 1,
      voicemails: 1,
      outgoing: 1,
      answerSeconds: 15,
      byMember: [{ member: "anna", answered: 2 }],
    });
    // Thursday 22 Oct, 09:30 in Berlin (summer time); Saturday 24 Oct, 20:00.
    expect(stats.missedAt[3]![9]).toBe(1);
    expect(stats.missedAt[5]![20]).toBe(1);
  });
});
