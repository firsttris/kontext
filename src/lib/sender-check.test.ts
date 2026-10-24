import { describe, expect, it } from "vitest";
import { isConfirmed, parseSenderCheck, parseSpamScore, senderWarnings } from "./sender-check";

// As Stalwart writes them (seen on a local instance, see dev/stalwart.ts).
const unknownDomain =
  "localhost; spf=permerror (localhost: unable to verify SPF record for postmaster@[192.168.178.101]) smtp.helo=[192.168.178.101]; spf=none (localhost: no SPF records found for petra@keller-elektro.test) smtp.mailfrom=petra@keller-elektro.test; iprev=pass policy.iprev=127.0.0.1; dmarc=none header.from=keller-elektro.test policy.dmarc=none";
const dmarcFail =
  "localhost; spf=softfail (localhost: domain of no-reply@gmail.com reports soft fail for 127.0.0.1) smtp.mailfrom=no-reply@gmail.com; iprev=pass policy.iprev=127.0.0.1; dmarc=fail (policy not aligned) header.from=gmail.com policy.dmarc=none";
const allPass =
  "mail.weber.test; dkim=pass header.d=keller-elektro.de header.s=mail header.b=abc; spf=pass (mail.weber.test: domain of petra@keller-elektro.de designates 1.2.3.4 as permitted sender) smtp.mailfrom=petra@keller-elektro.de; dmarc=pass header.from=keller-elektro.de";

describe("parseSenderCheck", () => {
  it("reads SPF of the envelope sender, not of the HELO name", () => {
    expect(parseSenderCheck([unknownDomain])).toEqual({
      spf: { result: "none", domain: "keller-elektro.test" },
      iprev: { result: "pass" },
      dmarc: { result: "none", domain: "keller-elektro.test" },
    });
  });

  it("reads DKIM, SPF and DMARC with their domains", () => {
    expect(parseSenderCheck([allPass])).toEqual({
      dkim: { result: "pass", domain: "keller-elektro.de" },
      spf: { result: "pass", domain: "keller-elektro.de" },
      dmarc: { result: "pass", domain: "keller-elektro.de" },
    });
  });

  it("trusts only the topmost header; one below came with the mail", () => {
    const forged = "evil.example; dkim=pass header.d=gmail.com; spf=pass; dmarc=pass";
    expect(parseSenderCheck([dmarcFail, forged])?.dmarc?.result).toBe("fail");
  });

  it("keeps semicolons inside comments", () => {
    const check = parseSenderCheck(["mx; spf=fail (mx: a; b) smtp.mailfrom=x@bad.test"]);
    expect(check?.spf).toEqual({ result: "fail", domain: "bad.test" });
  });

  it("has nothing for a mail that did not come in from outside", () => {
    expect(parseSenderCheck(null)).toBeUndefined();
    expect(parseSenderCheck([])).toBeUndefined();
  });
});

describe("parseSpamScore", () => {
  it("reads class and score", () => {
    expect(parseSpamScore("spam, score=17.20")).toEqual({ isSpam: true, score: 17.2 });
    expect(parseSpamScore("ham, score=-1.40, avg_confidence=0.9")).toEqual({
      isSpam: false,
      score: -1.4,
    });
    expect(parseSpamScore(undefined)).toBeUndefined();
  });
});

describe("isConfirmed", () => {
  it("needs DMARC, or SPF or DKIM passing for the sender's domain", () => {
    expect(isConfirmed(parseSenderCheck([allPass])!, "keller-elektro.de")).toBe(true);
    expect(isConfirmed({ spf: { result: "pass", domain: "mail.keller.de" } }, "keller.de")).toBe(
      true,
    );
    expect(isConfirmed({ dkim: { result: "pass", domain: "mailer.example" } }, "keller.de")).toBe(
      false,
    );
    expect(isConfirmed(parseSenderCheck([unknownDomain])!, "keller-elektro.test")).toBe(false);
  });
});

describe("senderWarnings", () => {
  const ownDomains = ["weber-haustechnik.test"];
  const from = (email: string) => ({ name: null, email });

  it("says nothing about an ordinary mail", () => {
    expect(
      senderWarnings({
        check: parseSenderCheck([unknownDomain]),
        from: from("petra@keller-elektro.test"),
        replyTo: null,
        ownDomains,
      }),
    ).toEqual([]);
  });

  it("warns when DMARC failed", () => {
    expect(
      senderWarnings({
        check: parseSenderCheck([dmarcFail]),
        from: from("no-reply@gmail.com"),
        replyTo: null,
        ownDomains,
      }),
    ).toEqual([{ kind: "notConfirmed", domain: "gmail.com" }]);
  });

  it("warns on a hard SPF fail only without a passing DKIM signature", () => {
    const spfFail = { spf: { result: "fail", domain: "bank.test" } };
    const args = { from: from("info@bank.test"), replyTo: null, ownDomains };
    expect(senderWarnings({ ...args, check: spfFail })).toHaveLength(1);
    expect(
      senderWarnings({
        ...args,
        check: { ...spfFail, dkim: { result: "pass", domain: "bank.test" } },
      }),
    ).toEqual([]);
    expect(
      senderWarnings({ ...args, check: { spf: { result: "softfail", domain: "bank.test" } } }),
    ).toEqual([]);
  });

  it("warns when a mail from outside poses as the own company", () => {
    expect(
      senderWarnings({
        check: parseSenderCheck([unknownDomain]),
        from: from("jonas@weber-haustechnik.test"),
        replyTo: null,
        ownDomains,
      }),
    ).toEqual([{ kind: "ownDomain", domain: "weber-haustechnik.test" }]);
  });

  it("warns when answers go to another domain, not to a sibling address", () => {
    const args = { check: parseSenderCheck([allPass]), from: from("petra@keller-elektro.de") };
    expect(
      senderWarnings({ ...args, replyTo: [from("buchhaltung@keller-elektro.de")], ownDomains }),
    ).toEqual([]);
    expect(
      senderWarnings({ ...args, replyTo: [from("petra@konto-neu.example")], ownDomains }),
    ).toEqual([
      { kind: "replyTo", replyTo: "petra@konto-neu.example", from: "petra@keller-elektro.de" },
    ]);
  });

  it("does not judge mail that did not come in from outside", () => {
    expect(
      senderWarnings({
        check: undefined,
        from: from("jonas@weber-haustechnik.test"),
        replyTo: [from("x@other.test")],
        ownDomains,
      }),
    ).toEqual([]);
  });
});
