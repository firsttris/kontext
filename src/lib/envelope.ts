/**
 * The SMTP envelope of an EmailSubmission (RFC 8621 §7): when the server sends the mail
 * (FUTURERELEASE, RFC 4865) and whether the receiving server reports the delivery (DSN,
 * RFC 3461). Pure.
 */

/**
 * When the server sends it: after a few seconds, so it can still be taken back, or at a time
 * ("Später senden").
 */
export type Hold = { seconds: number } | { until: string };

export type EnvelopeAddress = { email: string; parameters?: Record<string, string> };
export type Envelope = { mailFrom: EnvelopeAddress; rcptTo: EnvelopeAddress[] };

/** Report success and failure, not delays: the proof that the mail was accepted, or why not. */
export const DSN_NOTIFY = "SUCCESS,FAILURE";

/**
 * xtext (RFC 3461 §4): ENVID and ORCPT are written as printable ASCII, "+" and "=" and anything
 * else as "+" and two hex digits.
 */
export const xtext = (value: string): string =>
  [...new TextEncoder().encode(value)]
    .map((byte) =>
      byte >= 33 && byte <= 126 && byte !== 43 && byte !== 61
        ? String.fromCharCode(byte)
        : `+${byte.toString(16).toUpperCase().padStart(2, "0")}`,
    )
    .join("");

/** xtext read back; "+HH" becomes the byte it stands for. */
export const fromXtext = (value: string): string =>
  new TextDecoder().decode(
    Uint8Array.from(
      value
        .match(/\+[0-9A-Fa-f]{2}|[\s\S]/g)
        ?.map((token) =>
          token.length === 3 ? Number.parseInt(token.slice(1), 16) : token.charCodeAt(0),
        ) ?? [],
    ),
  );

/**
 * The envelope id of a mail asking for a delivery report: the local part of the Message-ID Kontext
 * gave it. The report carries it back (Original-Envelope-Id), so it finds its mail; at most 100
 * characters (RFC 3461 §4.4).
 */
export const envelopeIdOf = (messageId: string): string =>
  xtext(messageId.split("@")[0] ?? messageId).slice(0, 100);

/** FUTURERELEASE's parameter for MAIL FROM. */
export const holdParameters = (hold: Hold): Record<string, string> =>
  "until" in hold ? { HOLDUNTIL: hold.until } : { HOLDFOR: String(hold.seconds) };

/** Every address once, without case, in the order given. */
const unique = (emails: string[]) =>
  emails.filter(
    (email, index) =>
      emails.findIndex((other) => other.toLowerCase() === email.toLowerCase()) === index,
  );

export type EnvelopeInput = {
  from: string;
  /** To, Cc and Bcc. */
  recipients: string[];
  hold?: Hold;
  /** Ask for a delivery report: the envelope id it is to carry back (envelopeIdOf). */
  reportId?: string | null;
};

/**
 * The envelope for a submission, or undefined when the server's own (from the headers) will do.
 * A held mail leaves the recipients to the server; one asking for a report names each of them,
 * since NOTIFY goes with every recipient (RFC 3461 §4.1). RET=HDRS: the report brings back only
 * the headers, not the whole mail.
 */
export const submissionEnvelope = ({
  from,
  recipients,
  hold,
  reportId,
}: EnvelopeInput): Envelope | undefined => {
  if (!hold && !reportId) return undefined;
  const parameters = {
    ...(hold ? holdParameters(hold) : {}),
    ...(reportId ? { RET: "HDRS", ENVID: reportId } : {}),
  };
  return {
    mailFrom: { email: from, parameters },
    rcptTo: reportId
      ? unique(recipients).map((email) => ({ email, parameters: { NOTIFY: DSN_NOTIFY } }))
      : [],
  };
};

/** The envelope id a submission asked a report for, or null when it asked for none. */
export const requestedReportId = (envelope: {
  mailFrom: { parameters?: Record<string, string | null> | null };
  rcptTo: { parameters?: Record<string, string | null> | null }[];
}): string | null => {
  const notify = envelope.rcptTo.some((rcpt) =>
    /SUCCESS|FAILURE/i.test(
      Object.entries(rcpt.parameters ?? {}).find(([key]) => key.toUpperCase() === "NOTIFY")?.[1] ??
        "",
    ),
  );
  const id = Object.entries(envelope.mailFrom.parameters ?? {}).find(
    ([key]) => key.toUpperCase() === "ENVID",
  )?.[1];
  return notify && id ? id : null;
};
