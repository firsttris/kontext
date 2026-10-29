/**
 * Delivery reports (DSN, RFC 3464): the mail a server sends back when asked (RFC 3461), a
 * multipart/report with a line for people and the machine-readable message/delivery-status. How
 * one is recognised, where its status part is, and what it says. Pure.
 */

import type { BodyStructure } from "@/jmap/types";
import { fromXtext } from "./envelope";

/** What became of the mail for one recipient (RFC 3464 §2.3.3); "expanded" counts as delivered. */
export type DeliveryOutcome = "delivered" | "failed" | "delayed" | "relayed";

export type RecipientReport = {
  /** The address the report is about (Final-Recipient, else Original-Recipient). */
  recipient: string;
  outcome: DeliveryOutcome;
  /** The status code, e.g. "2.1.5" or "5.1.1" (RFC 3463). */
  status: string | null;
  /** The receiving server's own words, e.g. "550 5.1.1 User unknown". */
  diagnostic: string | null;
  /** When it was last tried (Last-Attempt-Date), as ISO, if given. */
  lastAttempt: string | null;
};

export type DeliveryReport = {
  /** The envelope id the mail was sent with (ENVID), to find it again. */
  envelopeId: string | null;
  /** The server that reports (Reporting-MTA without its type). */
  reportingMta: string | null;
  recipients: RecipientReport[];
};

/** Whether a mail is a delivery report, by its Content-Type header. */
export const isDeliveryReport = (contentType: string | null | undefined): boolean =>
  /multipart\/report/i.test(contentType ?? "") &&
  /report-type\s*=\s*"?delivery-status/i.test(contentType ?? "");

const STATUS_TYPES = ["message/delivery-status", "message/global-delivery-status"];

/** Whether a part is the machine-readable one; shown as the report, not as an attachment. */
export const isStatusPart = (part: { type: string }): boolean =>
  STATUS_TYPES.includes(part.type.toLowerCase());

/** The machine-readable part of a report, wherever it sits in the tree. */
export const deliveryStatusPart = (part: BodyStructure | null): BodyStructure | null => {
  if (!part) return null;
  if (isStatusPart(part)) return part;
  for (const child of part.subParts ?? []) {
    const found = deliveryStatusPart(child);
    if (found) return found;
  }
  return null;
};

/** The groups of fields: lines folded back (RFC 5322 §2.2.3), split at the blank lines. */
const fieldGroups = (text: string): Map<string, string>[] =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]+/g, " ")
    .split(/\n\s*\n/)
    .map(
      (group) =>
        new Map(
          group
            .split("\n")
            .map((line) => /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line.trim()))
            .filter((match): match is RegExpExecArray => match !== null)
            .map(([, name, value]) => [name!.toLowerCase(), value!.trim()] as const),
        ),
    )
    .filter((group) => group.size > 0);

/** "rfc822;anna@x.test" → "anna@x.test": the address without its type. */
const withoutType = (value: string | undefined) =>
  value ? value.slice(value.indexOf(";") + 1).trim() || null : null;

const outcomeOf = (action: string): DeliveryOutcome | null => {
  const word = action.toLowerCase().split(/\s/)[0];
  if (word === "delivered" || word === "expanded") return "delivered";
  if (word === "failed" || word === "delayed" || word === "relayed") return word;
  return null;
};

const isoOf = (date: string | undefined) => {
  const time = date ? Date.parse(date) : Number.NaN;
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};

const recipientReport = (fields: Map<string, string>): RecipientReport | null => {
  const recipient =
    withoutType(fields.get("final-recipient")) ?? withoutType(fields.get("original-recipient"));
  const outcome = outcomeOf(fields.get("action") ?? "");
  if (!recipient || !outcome) return null;
  return {
    recipient,
    outcome,
    status: fields.get("status")?.split(/\s/)[0] ?? null,
    diagnostic: withoutType(fields.get("diagnostic-code")),
    lastAttempt: isoOf(fields.get("last-attempt-date")),
  };
};

/**
 * The message/delivery-status part read (RFC 3464 §2): the fields for the message first, then
 * one group per recipient. Groups without a recipient or an action are left out.
 */
export const parseDeliveryStatus = (text: string): DeliveryReport => {
  const [message = new Map<string, string>(), ...groups] = fieldGroups(text);
  const envelopeId = message.get("original-envelope-id");
  return {
    envelopeId: envelopeId ? fromXtext(envelopeId) : null,
    reportingMta: withoutType(message.get("reporting-mta")),
    recipients: groups.flatMap((group) => recipientReport(group) ?? []),
  };
};

/** Whether a report is about the mail sent with this envelope id (both read as xtext). */
export const reportsOn = (report: DeliveryReport, envelopeId: string): boolean =>
  report.envelopeId !== null && report.envelopeId === fromXtext(envelopeId);
