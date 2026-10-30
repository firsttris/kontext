import { describe, expect, it } from "vitest";
import { localStart } from "./seed-objects";

// The clocks in Berlin go forward on Sunday, 28 March 2027, at 02:00 (01:00 UTC).
describe("localStart across the change to summer time", () => {
  it("gives tomorrow late on the evening before", () => {
    // Saturday, 27 March 2027, 23:30 in Berlin (CET).
    expect(localStart(1, "09:00", Date.parse("2027-03-27T22:30:00Z"))).toBe(
      "2027-03-28T09:00:00",
    );
  });

  it("gives yesterday just after midnight on the day after", () => {
    // Monday, 29 March 2027, 00:30 in Berlin (CEST).
    expect(localStart(-1, "09:00", Date.parse("2027-03-28T22:30:00Z"))).toBe(
      "2027-03-28T09:00:00",
    );
  });
});
