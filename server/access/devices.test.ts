import { describe, expect, it } from "vitest";
import { deviceOf, devicesOf, type SessionRow } from "./devices";

const UA = {
  firefoxWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};

describe("deviceOf", () => {
  it("names browser and system the way people know them", () => {
    expect(deviceOf(UA.firefoxWindows)).toEqual({ browser: "Firefox", system: "Windows" });
    expect(deviceOf(UA.chromeMac)).toEqual({ browser: "Chrome", system: "macOS" });
    expect(deviceOf(UA.edgeWindows)).toEqual({ browser: "Edge", system: "Windows" });
    expect(deviceOf(UA.safariIphone)).toEqual({ browser: "Safari", system: "iPhone" });
    expect(deviceOf(UA.chromeAndroid)).toEqual({ browser: "Chrome", system: "Android" });
  });

  it("says nothing it cannot tell", () => {
    expect(deviceOf(null)).toEqual({ browser: null, system: null });
    expect(deviceOf("curl/8.5.0")).toEqual({ browser: null, system: null });
  });
});

describe("devicesOf", () => {
  const at = (iso: string) => new Date(iso);
  const row = (id: string, updated: string, grant: string | null = null): SessionRow => ({
    id,
    userAgent: UA.firefoxWindows,
    ipAddress: "203.0.113.7",
    createdAt: at("2026-10-01T08:00:00Z"),
    updatedAt: at(updated),
    grantUpdatedAt: grant ? at(grant) : null,
  });

  it("puts this device first, then the most recently used, and leaves out apps and agents", () => {
    const rows = [
      row("old", "2026-10-02T08:00:00Z"),
      row("app", "2026-10-30T08:00:00Z"),
      row("me", "2026-10-03T08:00:00Z"),
      row("recent", "2026-10-04T08:00:00Z"),
    ];
    const devices = devicesOf(rows, new Set(["app"]), "me");
    expect(devices.map((d) => [d.id, d.current])).toEqual([
      ["me", true],
      ["recent", false],
      ["old", false],
    ]);
    expect(devices[0]).toMatchObject({ browser: "Firefox", system: "Windows", ip: "203.0.113.7" });
  });

  it("counts a renewed Stalwart token as use", () => {
    const [device] = devicesOf(
      [row("a", "2026-10-02T08:00:00Z", "2026-10-29T17:30:00Z")],
      new Set(),
      "x",
    );
    expect(device?.lastActive).toBe("2026-10-29T17:30:00.000Z");
  });
});
