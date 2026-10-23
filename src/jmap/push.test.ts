import { describe, expect, it } from "vitest";
import { parseEvents } from "./push";

describe("parseEvents", () => {
  it("returns complete events and keeps the rest", () => {
    const { events, rest } = parseEvents(
      'event: state\ndata: {"changed":{"b":{"Email":"s1"}}}\n\n: ping\n\nevent: state\ndata: {"cha',
    );
    expect(events).toEqual([{ type: "state", data: '{"changed":{"b":{"Email":"s1"}}}' }]);
    expect(rest).toBe('event: state\ndata: {"cha');
  });
});
