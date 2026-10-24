import { describe, expect, it } from "vitest";
import {
  type Call,
  callDuration,
  callerState,
  firstNameList,
  RING_TIMEOUT_MS,
  ringingCall,
} from "./calls";

const call = (
  channelId: string,
  startedBy: string,
  startedAt = "2026-10-24T10:00:00.000Z",
): Call => ({
  channelId,
  startedBy,
  startedAt,
  video: false,
  participants: [startedBy],
});

const channels = [
  { id: "dm", kind: "direct" as const, members: ["jonas", "anna"] },
  { id: "dm2", kind: "direct" as const, members: ["max", "anna"] },
  { id: "team", kind: "team" as const, members: [] },
];

describe("ringingCall", () => {
  it("rings for a direct call someone else opened", () => {
    expect(ringingCall([call("dm", "jonas")], channels, "anna", [])?.channelId).toBe("dm");
  });

  it("does not ring for the caller, someone already in it, a no, or a meeting", () => {
    expect(ringingCall([call("dm", "jonas")], channels, "jonas", [])).toBeNull();
    const joined = { ...call("dm", "jonas"), participants: ["jonas", "anna"] };
    expect(ringingCall([joined], channels, "anna", [])).toBeNull();
    expect(ringingCall([call("dm", "jonas")], channels, "anna", ["dm"])).toBeNull();
    expect(ringingCall([call("team", "jonas")], channels, "anna", [])).toBeNull();
    expect(ringingCall([call("dm", "jonas")], channels, "max", [])).toBeNull();
  });

  it("rings the older of two calls first", () => {
    const later = call("dm", "jonas", "2026-10-24T10:00:05.000Z");
    const earlier = call("dm2", "max", "2026-10-24T10:00:01.000Z");
    expect(ringingCall([later, earlier], channels, "anna", [])?.channelId).toBe("dm2");
  });
});

describe("callDuration", () => {
  const start = "2026-10-24T10:00:00.000Z";
  it("counts minutes and seconds, hours when needed", () => {
    expect(callDuration(start, new Date("2026-10-24T10:00:07Z"))).toBe("0:07");
    expect(callDuration(start, new Date("2026-10-24T10:12:40Z"))).toBe("12:40");
    expect(callDuration(start, new Date("2026-10-24T11:02:03Z"))).toBe("1:02:03");
    expect(callDuration(start, new Date("2026-10-24T09:59:00Z"))).toBe("0:00");
  });
});

describe("callerState", () => {
  const base = {
    kind: "direct" as const,
    others: ["anna"],
    joined: [],
    declinedBy: [],
    ringingFor: 0,
  };
  it("rings until someone comes, gives up after a while", () => {
    expect(callerState(base)).toBe("ringing");
    expect(callerState({ ...base, ringingFor: RING_TIMEOUT_MS })).toBe("unanswered");
    expect(callerState({ ...base, joined: ["anna"] })).toBe("talking");
  });

  it("stops when everyone called said no", () => {
    expect(callerState({ ...base, declinedBy: ["anna"] })).toBe("declined");
    expect(callerState({ ...base, others: ["anna", "max"], declinedBy: ["anna"] })).toBe("ringing");
  });

  it("lets a meeting in a channel simply run", () => {
    expect(callerState({ ...base, kind: "channel", ringingFor: RING_TIMEOUT_MS * 2 })).toBe(
      "talking",
    );
  });
});

describe("firstNameList", () => {
  it("names whom it rings for by first name", () => {
    const names: Record<string, string> = { anna: "Anna Schmidt", max: "Max Bauer" };
    expect(firstNameList(["anna"], (id) => names[id] ?? "")).toBe("Anna");
    expect(firstNameList(["anna", "max"], (id) => names[id] ?? "")).toBe("Anna, Max");
  });
});
