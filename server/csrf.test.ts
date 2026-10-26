// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fromOwnPage } from "./csrf";

const APP = "https://kontext.firma.test";
const request = (path: string, method: string, headers: Record<string, string> = {}) =>
  new Request(`${APP}${path}`, { method, headers });

describe("requests with the cookie", () => {
  it("let Kontext's own pages change things", () => {
    const own = { origin: APP, "sec-fetch-site": "same-origin" };
    expect(fromOwnPage(request("/api/company/employees/x/offboarding", "POST", own), APP)).toBe(
      true,
    );
  });

  it("refuse changes sent from a sister site, also as text/plain", () => {
    const sister = {
      origin: "https://dokumente.firma.test",
      "sec-fetch-site": "same-site",
      "content-type": "text/plain",
    };
    expect(fromOwnPage(request("/api/company/employees/x/offboarding", "POST", sister), APP)).toBe(
      false,
    );
    expect(fromOwnPage(request("/jmap", "POST", sister), APP)).toBe(false);
    // An older browser without Sec-Fetch-Site still names the origin.
    expect(
      fromOwnPage(request("/api/chat/x", "DELETE", { origin: "https://evil.test" }), APP),
    ).toBe(false);
  });

  it("let reads and routes with a sign-in of their own through", () => {
    const sister = { origin: "https://dokumente.firma.test", "sec-fetch-site": "same-site" };
    expect(fromOwnPage(request("/api/company/employees", "GET", sister), APP)).toBe(true);
    expect(fromOwnPage(request("/api/auth/oauth2/token", "POST", sister), APP)).toBe(true);
    expect(fromOwnPage(request("/mcp", "POST", sister), APP)).toBe(true);
    expect(fromOwnPage(request("/dav/tasks/x", "PUT", sister), APP)).toBe(true);
    expect(fromOwnPage(request("/api/calls/webhook", "POST", sister), APP)).toBe(true);
    // Only these paths: a lookalike prefix is no exemption.
    expect(fromOwnPage(request("/mcpx", "POST", sister), APP)).toBe(false);
  });

  it("let programs without a browser through", () => {
    expect(fromOwnPage(request("/api/phone/calls", "POST"), APP)).toBe(true);
  });
});
