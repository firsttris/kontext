import { describe, expect, it } from "vitest";
import { dayAfterKey } from "./mini-month";

describe("dayAfterKey", () => {
  it("goes a day sideways and a week up or down, across months", () => {
    expect(dayAfterKey("2026-10-28", "ArrowRight")).toBe("2026-10-29");
    expect(dayAfterKey("2026-10-01", "ArrowLeft")).toBe("2026-09-30");
    expect(dayAfterKey("2026-10-28", "ArrowDown")).toBe("2026-11-04");
    expect(dayAfterKey("2026-10-03", "ArrowUp")).toBe("2026-09-26");
  });

  it("jumps to the 1st of the month before or after with Page Up and Page Down", () => {
    expect(dayAfterKey("2026-10-28", "PageDown")).toBe("2026-11-01");
    expect(dayAfterKey("2026-01-15", "PageUp")).toBe("2025-12-01");
  });

  it("leaves other keys alone", () => {
    expect(dayAfterKey("2026-10-28", "Enter")).toBeNull();
    expect(dayAfterKey("2026-10-28", "a")).toBeNull();
  });
});
