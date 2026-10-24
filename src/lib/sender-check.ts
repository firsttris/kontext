/**
 * The sender check of a mail: what the mail server found when the mail came in (SPF, DKIM, DMARC,
 * reverse DNS, spam score), and the warnings the reading pane shows from it.
 *
 * Stalwart writes Authentication-Results (RFC 8601) and Received-SPF only for mail from the
 * internet (port 25), and puts them on top (crates/smtp/src/inbound/data.rs). Only the topmost
 * header counts: anything below it came with the mail and may be forged by the sender. A mail
 * without one did not come in from outside: sent by a colleague, or brought over by a move.
 */
import type { EmailAddress } from "@/jmap/types";

export type MethodResult = {
  /** "pass", "fail", "softfail", "neutral", "none", "temperror", "permerror", … */
  result: string;
  /** The domain the result is about: header.d (DKIM), smtp.mailfrom (SPF), header.from (DMARC). */
  domain?: string;
};

export type SenderCheck = {
  spf?: MethodResult;
  dkim?: MethodResult;
  dmarc?: MethodResult;
  iprev?: MethodResult;
};

/** Splits on ";" outside comments in parentheses and quoted strings. */
const splitResinfo = (header: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = "";
  for (const char of header) {
    if (char === '"' && depth === 0) quoted = !quoted;
    else if (!quoted && char === "(") depth++;
    else if (!quoted && char === ")") depth = Math.max(0, depth - 1);
    if (char === ";" && depth === 0 && !quoted) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  return [...parts, current].map((part) => part.trim()).filter(Boolean);
};

const withoutComments = (text: string): string => text.replace(/\([^()]*\)/g, " ");

export const domainOf = (value: string | undefined): string | undefined =>
  value?.replace(/^"|"$/g, "").split("@").pop()?.toLowerCase() || undefined;

const parseResinfo = (resinfo: string) => {
  const [head, ...props] = withoutComments(resinfo).trim().split(/\s+/);
  const [method, result] = (head ?? "").toLowerCase().split("=");
  const properties = Object.fromEntries(
    props.flatMap((prop) => {
      const at = prop.indexOf("=");
      return at > 0 ? [[prop.slice(0, at).toLowerCase(), prop.slice(at + 1)]] : [];
    }),
  );
  return { method: method ?? "", result: result ?? "", properties };
};

/**
 * Reads the topmost Authentication-Results header (JMAP `header:…:asText:all` lists them top
 * first). For SPF the check of the envelope sender counts, not the one of the HELO name.
 */
export const parseSenderCheck = (headers: string[] | null | undefined): SenderCheck | undefined => {
  const top = headers?.[0];
  if (!top) return undefined;
  const [, ...resinfos] = splitResinfo(top);
  const check: SenderCheck = {};
  for (const { method, result, properties } of resinfos.map(parseResinfo)) {
    if (method === "spf" && (properties["smtp.mailfrom"] || !check.spf))
      check.spf = {
        result,
        domain: domainOf(properties["smtp.mailfrom"] ?? properties["smtp.helo"]),
      };
    else if (method === "dkim" && (!check.dkim || result === "pass"))
      check.dkim = { result, domain: domainOf(properties["header.d"] ?? properties["header.i"]) };
    else if (method === "dmarc")
      check.dmarc = { result, domain: domainOf(properties["header.from"]) };
    else if (method === "iprev") check.iprev = { result };
  }
  return check;
};

/** X-Spam-Score is "spam, score=17.20" or "ham, score=-1.40" (crates/spam-filter/src/analysis/score.rs). */
export const parseSpamScore = (
  header: string | undefined,
): { isSpam: boolean; score: number } | undefined => {
  const match = header?.match(/^\s*(\w+)\s*,\s*score=(-?[\d.]+)/);
  return match ? { isSpam: match[1] === "spam", score: Number(match[2]) } : undefined;
};

/** Relaxed alignment (RFC 7489 §3.1): the same domain, or one a subdomain of the other. */
const aligned = (a: string | undefined, b: string | undefined): boolean =>
  Boolean(a && b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)));

/** The sender's domain is confirmed: DMARC passed, or SPF or DKIM passed for that domain. */
export const isConfirmed = (check: SenderCheck, fromDomain: string | undefined): boolean =>
  check.dmarc?.result === "pass" ||
  (check.dkim?.result === "pass" && aligned(check.dkim.domain, fromDomain)) ||
  (check.spf?.result === "pass" && aligned(check.spf.domain, fromDomain));

export type SenderWarning =
  | { kind: "ownDomain"; domain: string }
  | { kind: "notConfirmed"; domain: string }
  | { kind: "replyTo"; replyTo: string; from: string };

/**
 * Warnings for a mail from outside, each only when something is off:
 * - it claims to come from the own company but was not confirmed for it;
 * - DMARC failed, or SPF failed hard without a DKIM signature that passed (a soft fail alone is
 *   common with forwarded mail and says too little);
 * - answers would go to another domain than the sender's (Reply-To), a pattern of invoice fraud.
 */
export const senderWarnings = ({
  check,
  from,
  replyTo,
  ownDomains,
}: {
  check: SenderCheck | undefined;
  from: EmailAddress | undefined;
  replyTo: EmailAddress[] | null;
  ownDomains: string[];
}): SenderWarning[] => {
  if (!check || !from) return [];
  const domain = domainOf(from.email);
  if (!domain) return [];
  const warnings: SenderWarning[] = [];
  if (ownDomains.includes(domain)) {
    if (!isConfirmed(check, domain)) warnings.push({ kind: "ownDomain", domain });
  } else if (
    check.dmarc?.result === "fail" ||
    (check.dmarc?.result !== "pass" &&
      check.spf?.result === "fail" &&
      check.dkim?.result !== "pass")
  ) {
    warnings.push({ kind: "notConfirmed", domain });
  }
  const other = replyTo?.find((address) => !aligned(domainOf(address.email), domain));
  if (other) warnings.push({ kind: "replyTo", replyTo: other.email, from: from.email });
  return warnings;
};
