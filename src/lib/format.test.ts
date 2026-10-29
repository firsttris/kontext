import { describe, expect, it } from "vitest";
import {
  displayName,
  firstName,
  formatSize,
  fullAddress,
  initials,
  listDate,
  noteDate,
  weekdayHeads,
} from "./format";

const now = new Date("2026-10-23T12:00:00+02:00");

describe("weekdayHeads", () => {
  it("names the week from Monday in two letters, in the app's language", () => {
    expect(weekdayHeads("de-DE")).toEqual(["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]);
    expect(weekdayHeads("en-GB")).toEqual(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
  });
});

describe("noteDate", () => {
  it("gives day, short month and time in Berlin", () => {
    expect(noteDate("2026-10-29T17:24:00Z")).toBe("29. Okt., 18:24");
  });
});

describe("listDate", () => {
  it("shows the time for today", () => {
    expect(listDate("2026-10-23T07:41:00Z", now)).toBe("09:41");
  });
  it("says Gestern for yesterday", () => {
    expect(listDate("2026-10-22T20:00:00Z", now)).toBe("Gestern");
  });
  it("shows the weekday within a week", () => {
    expect(listDate("2026-10-19T10:00:00Z", now)).toBe("Mo");
  });
  it("shows day and month this year, the full date before", () => {
    expect(listDate("2026-03-02T10:00:00Z", now)).toBe("02.03.");
    expect(listDate("2025-03-02T10:00:00Z", now)).toBe("02.03.2025");
  });
});

describe("names", () => {
  it("falls back to the address", () => {
    expect(displayName({ name: null, email: "info@x.test" })).toBe("info@x.test");
    expect(firstName({ name: "Petra Keller", email: "p@x.test" })).toBe("Petra");
  });
  it("builds initials", () => {
    expect(initials("Petra Keller")).toBe("PK");
    expect(initials("jonas@weber.test")).toBe("JO");
    expect(initials("Kanzlei Braun & Partner")).toBe("KP");
  });
});

describe("formatSize", () => {
  it("uses German decimals", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1536)).toBe("1,5 KB");
    expect(formatSize(4.6 * 1024 ** 3)).toBe("4,6 GB");
  });
});

describe("fullAddress", () => {
  it("shows name and address, or the address alone", () => {
    expect(fullAddress({ name: "Petra Keller", email: "petra@keller.de" })).toBe(
      "Petra Keller <petra@keller.de>",
    );
    expect(fullAddress({ name: " ", email: "petra@keller.de" })).toBe("petra@keller.de");
  });
});
