import { describe, expect, it } from "vitest";
import type { Mailbox } from "@/jmap/types";
import { acceptsImport, checkFile, dateHeader, parseMailDate, receivedAtOf } from "./eml-import";

const file = (name: string, type = "", size = 10) => ({ name, type, size });

describe("checkFile", () => {
  it("takes .eml files and message/rfc822 without the ending", () => {
    expect(checkFile(file("Angebot.EML"))).toEqual({ ok: true });
    expect(checkFile(file("mail", "message/rfc822"))).toEqual({ ok: true });
  });

  it("names Outlook .msg and .mbox files as not supported", () => {
    expect(checkFile(file("a.msg"))).toEqual({ ok: false, problem: "msg" });
    expect(checkFile(file("a", "application/vnd.ms-outlook"))).toEqual({
      ok: false,
      problem: "msg",
    });
    expect(checkFile(file("Posteingang.mbox"))).toEqual({ ok: false, problem: "mbox" });
  });

  it("refuses other and empty files", () => {
    expect(checkFile(file("a.pdf", "application/pdf"))).toEqual({ ok: false, problem: "type" });
    expect(checkFile(file("a.eml", "", 0))).toEqual({ ok: false, problem: "empty" });
  });
});

describe("dateHeader", () => {
  it("reads the header unfolded and stops at the body", () => {
    const raw = "From: a@b.de\r\nDATE: Tue, 1 Jul 2003\r\n 10:52:37 +0200\r\n\r\nDate: no";
    expect(dateHeader(raw)).toBe("Tue, 1 Jul 2003 10:52:37 +0200");
  });

  it("finds nothing in the body or without the header", () => {
    expect(dateHeader("From: a@b.de\n\nDate: Tue, 1 Jul 2003 10:52:37 +0200")).toBeUndefined();
    expect(dateHeader("Subject: x")).toBeUndefined();
  });
});

describe("parseMailDate", () => {
  it("reads the zone offset", () => {
    expect(parseMailDate("Tue, 1 Jul 2003 10:52:37 +0200")?.toISOString()).toBe(
      "2003-07-01T08:52:37.000Z",
    );
    expect(parseMailDate("1 Dec 2025 23:30 -0130")?.toISOString()).toBe("2025-12-02T01:00:00.000Z");
  });

  it("takes comments, old zone names and two-digit years", () => {
    expect(parseMailDate("Mon, 3 Mar 2025 09:00:00 +0100 (CET)")?.toISOString()).toBe(
      "2025-03-03T08:00:00.000Z",
    );
    expect(parseMailDate("3 Mar 99 09:00:00 GMT")?.toISOString()).toBe("1999-03-03T09:00:00.000Z");
    expect(parseMailDate("3 Mar 05 09:00:00 EST")?.toISOString()).toBe("2005-03-03T09:00:00.000Z");
  });

  it("reads the US zone names RFC 5322 §4.3 defines, and three-digit years", () => {
    expect(parseMailDate("3 Mar 05 09:00:00 EST")?.toISOString()).toBe("2005-03-03T14:00:00.000Z");
    expect(parseMailDate("Fri, 4 Jul 2025 08:00:00 PDT")?.toISOString()).toBe(
      "2025-07-04T15:00:00.000Z",
    );
    expect(parseMailDate("Mon, 6 Jan 2025 10:00:00 cst")?.toISOString()).toBe(
      "2025-01-06T16:00:00.000Z",
    );
    expect(parseMailDate("Mon, 6 Jan 2025 10:00:00 UT")?.toISOString()).toBe(
      "2025-01-06T10:00:00.000Z",
    );
    expect(parseMailDate("1 Jan 100 12:00:00 +0000")?.toISOString()).toBe(
      "2000-01-01T12:00:00.000Z",
    );
  });

  it("gives nothing for what is no date", () => {
    expect(parseMailDate("gestern")).toBeUndefined();
    expect(parseMailDate("3 Foo 2025 09:00:00 +0000")).toBeUndefined();
  });
});

describe("receivedAtOf", () => {
  const now = new Date("2026-10-29T12:00:00Z");

  it("is the Date header as a UTCDate", () => {
    const raw = "Date: Tue, 1 Jul 2003 10:52:37 +0200\r\nSubject: x\r\n\r\nHallo";
    expect(receivedAtOf(raw, now)).toBe("2003-07-01T08:52:37Z");
  });

  it("is left to Stalwart for a date in the future or none", () => {
    expect(receivedAtOf("Date: 1 Jan 2030 10:00:00 +0000\n\nx", now)).toBeUndefined();
    expect(receivedAtOf("Date: kaputt\n\nx", now)).toBeUndefined();
    expect(receivedAtOf("Subject: x\n\nx", now)).toBeUndefined();
  });
});

describe("acceptsImport", () => {
  const box = (role: string | null, mayAddItems?: boolean) =>
    ({ id: "b", name: "B", role, myRights: { mayAddItems } }) as unknown as Mailbox;

  it("takes folders the user may add to, not Entwürfe and the views", () => {
    expect(acceptsImport(box(null))).toBe(true);
    expect(acceptsImport(box("inbox", true))).toBe(true);
    expect(acceptsImport(box(null, false))).toBe(false);
    expect(acceptsImport(box("drafts"))).toBe(false);
    expect(acceptsImport(box("snoozed"))).toBe(false);
  });
});
