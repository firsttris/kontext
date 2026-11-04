/**
 * „Als Phishing melden“: the suspicious mail goes to the company's report address as a
 * message/rfc822 attachment, by the blob it already has (as "Als Anhang weiterleiten",
 * startEmlForward), so the IT sees it whole, headers included. The report is created in Drafts
 * and destroyed once it is submitted (onSuccessDestroyEmail, RFC 8621 §7.5; Stalwart
 * crates/jmap/src/submission/set.rs), so no copy is left in Sent.
 */
import { type EmlOriginal, startEmlForward } from "@/lib/compose";
import { textToHtml } from "@/lib/html";
import { bodyStructureOf } from "@/lib/mail-structure";
import { assertSetOk, CAPABILITIES, type Invocation, type JmapClient } from "./client";
import type { Identity } from "./types";

export type PhishingReport = {
  accountId: string;
  identity: Pick<Identity, "id" | "name" | "email">;
  /** The report address set in the Firmenverwaltung. */
  to: string;
  original: EmlOriginal;
  draftsId: string;
  subject: string;
  /** One line for the IT; the original is attached. */
  text: string;
};

/** The Email/set and EmailSubmission/set calls of one report. Pure. */
export const phishingReportCalls = (report: PhishingReport): Invocation[] => [
  [
    "Email/set",
    {
      accountId: report.accountId,
      create: {
        report: {
          mailboxIds: { [report.draftsId]: true },
          keywords: { $seen: true, $draft: true },
          from: [{ name: report.identity.name, email: report.identity.email }],
          to: [{ name: null, email: report.to }],
          subject: report.subject,
          bodyValues: {
            text: { value: report.text },
            html: { value: textToHtml(report.text) },
          },
          bodyStructure: bodyStructureOf(startEmlForward([report.original]).attachments),
        },
      },
    },
    "0",
  ],
  [
    "EmailSubmission/set",
    {
      accountId: report.accountId,
      create: { send: { identityId: report.identity.id, emailId: "#report" } },
      onSuccessDestroyEmail: ["#send"],
    },
    "1",
  ],
];

export const sendPhishingReport = async (client: JmapClient, report: PhishingReport) => {
  const responses = await client.request(phishingReportCalls(report), [
    CAPABILITIES.core,
    CAPABILITIES.mail,
    CAPABILITIES.submission,
  ]);
  assertSetOk(responses[0]![1], "Meldung");
  assertSetOk(responses[1]![1], "Versand");
};
