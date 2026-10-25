import { describe, expect, it } from "vitest";
import { transportOf } from "./transport";

describe("how a mail came", () => {
  it("knows TLS by the protocol after with", () => {
    expect(
      transportOf([
        "from mx.gmx.net (mx.gmx.net [212.227.17.5]) by mail.firma.de (Stalwart SMTP) with ESMTPS id 4AC; Sun, 25 Oct 2026 05:50:15 +0000",
        "from [10.0.0.2] by mx.gmx.net with ESMTP",
      ]),
    ).toBe("encrypted");
    expect(transportOf(["from x by y with ESMTPSA id 1"])).toBe("encrypted");
    expect(
      transportOf(["from x by y (Postfix) with ESMTP id 1 (using TLSv1.3 with cipher x)"]),
    ).toBe("encrypted");
  });

  it("plain SMTP is unencrypted; a mail made on the server shows nothing", () => {
    expect(
      transportOf([
        "from mail.example.test (s.local [127.0.0.1]) by localhost (Stalwart SMTP) with ESMTP id 4AC; Sun, 25 Oct 2026 05:50:15 +0000",
      ]),
    ).toBe("unencrypted");
    expect(transportOf([])).toBeNull();
    expect(transportOf(null)).toBeNull();
    expect(transportOf(["from x by y with HTTP"])).toBeNull();
  });
});
