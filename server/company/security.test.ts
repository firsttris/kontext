// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type Answer, checkDomain, httpsCheck, policyMode, type Resolve } from "./security";

const dns =
  (records: Record<string, string[]>, secure = false): Resolve =>
  async (name, type): Promise<Answer> => ({ data: records[`${type} ${name}`] ?? [], secure });

describe("mail security of a domain", () => {
  it("all set: SPF, DMARC enforced, MTA-STS enforce, TLS-RPT, DANE with DNSSEC", async () => {
    const result = await checkDomain(
      "firma.de",
      dns(
        {
          "MX firma.de": ["10 mail.firma.de."],
          "TXT firma.de": ["v=spf1 mx -all"],
          "TXT _dmarc.firma.de": ["v=DMARC1; p=quarantine"],
          "TXT _mta-sts.firma.de": ["v=STSv1; id=1"],
          "TXT _smtp._tls.firma.de": ["v=TLSRPTv1; rua=mailto:tls@firma.de"],
          "TLSA _25._tcp.mail.firma.de": ["3 1 1 abcd"],
        },
        true,
      ),
      async () => "version: STSv1\nmode: enforce\nmx: mail.firma.de\nmax_age: 604800",
    );
    expect(result.checks.map((c) => [c.id, c.state])).toEqual([
      ["mx", "ok"],
      ["spf", "ok"],
      ["dmarc", "ok"],
      ["mtaSts", "ok"],
      ["tlsRpt", "ok"],
      ["dane", "ok"],
    ]);
  });

  it("says what is missing or only half done", async () => {
    const result = await checkDomain(
      "firma.de",
      dns({
        "MX firma.de": ["10 mail.firma.de."],
        "TXT _dmarc.firma.de": ["v=DMARC1; p=none"],
        "TXT _mta-sts.firma.de": ["v=STSv1; id=1"],
      }),
      async () => "version: STSv1\nmode: testing",
    );
    expect(Object.fromEntries(result.checks.map((c) => [c.id, c.state]))).toMatchObject({
      spf: "missing",
      dmarc: "warn",
      mtaSts: "warn",
      tlsRpt: "missing",
      dane: "info",
    });
  });

  it("reads the policy mode and checks https", () => {
    expect(policyMode("version: STSv1\r\nMode: Enforce\r\n")).toBe("enforce");
    expect(policyMode(null)).toBeNull();
    expect(httpsCheck("https://kontext.firma.de").state).toBe("ok");
    expect(httpsCheck("http://localhost:18090").state).toBe("warn");
  });
});
