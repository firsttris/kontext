import { describe, expect, it } from "vitest";
import { checkSince, FETCH_EVERY_MS, isDue } from "./fetcher";
import type { ExternalAccount } from "./store";

const account = (patch: Partial<ExternalAccount>) =>
  ({ status: "active", lastRunAt: null, ...patch }) as ExternalAccount;

describe("isDue", () => {
  const now = 1_000_000_000;

  it("fetches a new account and one whose last fetch is two minutes old", () => {
    expect(isDue(account({}), now)).toBe(true);
    expect(isDue(account({ lastRunAt: new Date(now - FETCH_EVERY_MS) }), now)).toBe(true);
    expect(isDue(account({ lastRunAt: new Date(now - 30_000) }), now)).toBe(false);
  });

  it("waits while running and after a refused login", () => {
    expect(isDue(account({ status: "running" }), now)).toBe(false);
    expect(isDue(account({ status: "login-failed" }), now)).toBe(false);
  });
});

describe("checkSince", () => {
  const now = new Date("2026-10-25T08:00:00Z");
  const previous = { uidValidity: "7", lastUid: 40 };

  it("checks the whole account on a first run and after the inbox was rebuilt", () => {
    expect(checkSince(undefined, "7", [], now)).toBeNull();
    expect(checkSince(previous, "8", [], now)).toBeNull();
  });

  it("checks new mail only from a day before the oldest of it", () => {
    const heads = [
      { internalDate: new Date("2026-10-25T07:58:00Z") },
      { internalDate: new Date("2026-10-24T20:00:00Z") },
      { internalDate: null },
    ];
    expect(checkSince(previous, "7", heads, now)).toEqual(new Date("2026-10-23T20:00:00Z"));
    expect(checkSince(previous, "7", [{ internalDate: null }], now)).toEqual(
      new Date("2026-10-24T08:00:00Z"),
    );
  });
});
