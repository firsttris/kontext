import { describe, expect, it } from "vitest";
import { serversFor, smtpFor } from "./providers";

describe("smtpFor", () => {
  it("takes the server of a known provider", () => {
    expect(smtpFor("gmail", { host: "evil.example", port: 25 })).toEqual({
      host: "smtp.gmail.com",
      port: 465,
    });
  });

  it("allows other servers only on submission ports", () => {
    expect(smtpFor("other", { host: "Mail.Firma.de", port: 587 })).toEqual({
      host: "mail.firma.de",
      port: 587,
    });
    expect(smtpFor("other", { host: "mail.firma.de", port: 25 })).toBeNull();
    expect(smtpFor("other", { host: "a b" })).toBeNull();
    expect(smtpFor("other", { host: "127.0.0.1", port: 20025 }, true)?.port).toBe(20025);
  });
});

describe("serversFor", () => {
  it("needs both servers", () => {
    expect(serversFor("gmx", {}, {})).toEqual({
      imap: { host: "imap.gmx.net", port: 993 },
      smtp: { host: "mail.gmx.net", port: 465 },
    });
    expect(
      serversFor("other", { host: "mail.firma.de" }, { host: "mail.firma.de", port: 25 }),
    ).toBe(null);
  });
});
