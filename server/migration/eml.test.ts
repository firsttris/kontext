import { describe, expect, it } from "vitest";
import { mailFacts } from "./eml";

describe("mailFacts", () => {
  it("reads Message-ID, date and read state, also readpst's doubled date", () => {
    const raw = [
      "Date: Mon, 29 Oct 2001 22:16:28 -0800 (PST),Mon, 29 Oct 2001 22:16:28 -0800  (PST)",
      "Message-ID: <FBULX@zlsvr22>",
      "Subject: Test",
      "Status: RO",
      "",
      "Status: not a header",
    ].join("\r\n");
    expect(mailFacts(raw)).toEqual({
      messageId: "FBULX@zlsvr22",
      receivedAt: "2001-10-30T06:16:28Z",
      seen: true,
    });
  });

  it("copes with missing fields and folded lines", () => {
    expect(mailFacts("Subject: a\n b\nDate: kaputt\n\nHallo")).toEqual({
      messageId: null,
      receivedAt: null,
      seen: false,
    });
    expect(mailFacts("Message-ID:\n <x@y>\n\n").messageId).toBe("x@y");
  });
});
