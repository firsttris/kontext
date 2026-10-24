import { describe, expect, it } from "vitest";
import { endpointFor } from "./providers";

describe("endpointFor", () => {
  it("takes the server of a known provider", () => {
    expect(endpointFor("gmail", { host: "evil.example", port: 25 })).toEqual({
      host: "imap.gmail.com",
      port: 993,
    });
  });

  it("allows other servers only on IMAP ports", () => {
    expect(endpointFor("other", { host: "Mail.Firma.de", port: 143 })).toEqual({
      host: "mail.firma.de",
      port: 143,
    });
    expect(endpointFor("other", { host: "stalwart", port: 8080 })).toBeNull();
    expect(endpointFor("other", { host: "a b", port: 993 })).toBeNull();
    expect(endpointFor("other", { host: "127.0.0.1", port: 20143 }, true)).toEqual({
      host: "127.0.0.1",
      port: 20143,
    });
  });
});
