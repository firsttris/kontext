// @vitest-environment node
import { describe, expect, it } from "vitest";
import { appPolicy, hardenDownload, isDownload, withAppHeaders } from "./headers";

describe("downloads through the pass-through", () => {
  it("send HTML and scripts as bytes that never run", () => {
    for (const type of ["text/html", "text/javascript; charset=utf-8", "application/xhtml+xml"]) {
      const headers = new Headers({ "content-type": type });
      hardenDownload(headers);
      expect(headers.get("content-type")).toBe("application/octet-stream");
      expect(headers.get("content-security-policy")).toBe("sandbox");
      expect(headers.get("x-content-type-options")).toBe("nosniff");
      expect(headers.get("content-disposition")).toBe("attachment");
    }
  });

  it("keep the type of images and PDFs, for the previews", () => {
    const headers = new Headers({
      "content-type": "Image/PNG",
      "content-disposition": 'attachment; filename="a.png"',
    });
    hardenDownload(headers);
    expect(headers.get("content-type")).toBe("Image/PNG");
    expect(headers.get("content-disposition")).toBe('attachment; filename="a.png"');
  });

  it("are told apart by their path", () => {
    expect(isDownload("/jmap/download/a/b/x.js")).toBe(true);
    expect(isDownload("/jmap")).toBe(false);
  });
});

describe("the app's policy", () => {
  it("lets no other site frame Kontext and allows Schreibzeug's frame", () => {
    const policy = appPolicy({ schreibzeug: "https://dokumente.firma.test/" });
    expect(policy).toContain("frame-ancestors 'self'");
    expect(policy).toContain("frame-src 'self' blob: https://dokumente.firma.test;");
    expect(appPolicy()).toContain("frame-src 'self' blob:;");
  });

  it("lets the browser reach LiveKit where it has an address of its own", () => {
    expect(appPolicy({ livekit: "https://rtc.firma.test" })).toContain(
      "connect-src 'self' wss://rtc.firma.test;",
    );
  });

  it("is set on pages that bring no policy of their own", () => {
    const plain = new Headers({ "content-type": "text/html; charset=utf-8" });
    withAppHeaders(plain, "default-src 'self'");
    expect(plain.get("content-security-policy")).toBe("default-src 'self'");
    expect(plain.get("x-frame-options")).toBe("SAMEORIGIN");
    const sandboxed = new Headers({
      "content-type": "text/html",
      "content-security-policy": "sandbox",
    });
    withAppHeaders(sandboxed, "default-src 'self'");
    expect(sandboxed.get("content-security-policy")).toBe("sandbox");
  });
});
