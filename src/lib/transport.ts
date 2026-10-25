/**
 * Whether a mail came to the own server encrypted: from the topmost Received line (the own
 * server's), its protocol after "with" (RFC 3848: ESMTPS and ESMTPSA mean TLS). Mails made on the
 * server itself (invitations, the own mail between colleagues) have none and show nothing. Pure.
 */
export type Transport = "encrypted" | "unencrypted";

const ENCRYPTED = /^(e|utf8)?(smtp|lmtp)s(a)?$/i;
const PLAIN = /^(e|utf8)?(smtp|lmtp)(a)?$/i;

export const transportOf = (received: string[] | null | undefined): Transport | null => {
  const top = received?.[0];
  const protocol = top?.match(/\bwith\s+([A-Za-z0-9]+)/)?.[1];
  if (!protocol) return null;
  // "TLS" named in the line counts too (some servers write it in a comment).
  if (ENCRYPTED.test(protocol) || /\bTLSv?1\.[23]\b/.test(top ?? "")) return "encrypted";
  return PLAIN.test(protocol) ? "unencrypted" : null;
};
