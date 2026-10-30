import { describe, expect, it } from "vitest";
import { searchIndexStatus } from "./search-index";

describe("searchIndexStatus", () => {
  it("adds up what waits for the mail, calendar and contact indexes and notes a failure", () => {
    expect(
      searchIndexStatus([
        { index: "email", queuedUpdates: 120, queuedDeletions: 3, status: { "@type": "Running" } },
        { index: "calendar", queuedUpdates: 5, queuedDeletions: 0, status: { "@type": "Running" } },
        {
          index: "email",
          queuedUpdates: 0,
          queuedDeletions: 0,
          status: { "@type": "Failed", reason: "disk full" },
        },
      ]),
    ).toEqual({ pending: 128, failed: true });
  });

  it("is idle when Stalwart lists nothing", () => {
    expect(searchIndexStatus([])).toEqual({ pending: 0, failed: false });
  });
});
