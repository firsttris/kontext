import { describe, expect, it } from "vitest";
import { phishingReportCalls } from "./phishing-report";

const report = {
  accountId: "a1",
  identity: { id: "i1", name: "Jonas Weber", email: "jonas@weber.test" },
  to: "it@dienstleister.test",
  original: { blobId: "raw1", subject: "Ihr Konto wird gesperrt", size: 2048 },
  draftsId: "drafts",
  subject: "Phishing-Verdacht: Ihr Konto wird gesperrt",
  text: "Gemeldet als Phishing-Verdacht.",
};

describe("phishingReportCalls", () => {
  const [[setName, set], [submitName, submit]] = phishingReportCalls(report) as [
    [string, { create: { report: Record<string, unknown> } }, string],
    [string, Record<string, unknown>, string],
  ];

  it("attaches the original whole, as a message/rfc822 file of its own blob", () => {
    expect(setName).toBe("Email/set");
    const mail = set.create.report;
    expect(mail).toMatchObject({
      mailboxIds: { drafts: true },
      from: [{ name: "Jonas Weber", email: "jonas@weber.test" }],
      to: [{ name: null, email: "it@dienstleister.test" }],
      subject: "Phishing-Verdacht: Ihr Konto wird gesperrt",
    });
    const parts = (mail.bodyStructure as { type: string; subParts: object[] }).subParts;
    expect(parts[1]).toEqual({
      blobId: "raw1",
      name: "Ihr Konto wird gesperrt.eml",
      type: "message/rfc822",
      disposition: "attachment",
    });
  });

  it("sends it and leaves no copy behind", () => {
    expect(submitName).toBe("EmailSubmission/set");
    expect(submit).toEqual({
      accountId: "a1",
      create: { send: { identityId: "i1", emailId: "#report" } },
      onSuccessDestroyEmail: ["#send"],
    });
    expect(submit).not.toHaveProperty("onSuccessUpdateEmail");
  });
});
