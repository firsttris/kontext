/**
 * Preparing a mail Kontext stored in Stalwart for sending through another provider. JMAP keeps
 * the Bcc recipients as a header of the stored mail; it must not go out (RFC 5322 §3.6.3), so it
 * is cut from the header block before the mail is handed over. Pure functions.
 */

/** Where the header block ends: after the first empty line (CRLF or LF). */
const headerEnd = (text: string): number => {
  const crlf = text.indexOf("\r\n\r\n");
  const lf = text.indexOf("\n\n");
  if (crlf === -1) return lf === -1 ? text.length : lf + 2;
  return lf === -1 || crlf < lf ? crlf + 4 : lf + 2;
};

/** The mail without its Bcc header (and its folded continuation lines), byte for byte otherwise. */
export const withoutBcc = (raw: Uint8Array): Uint8Array => {
  // "binary" maps every byte to one character and back, so nothing else changes.
  const text = Buffer.from(raw).toString("binary");
  const end = headerEnd(text);
  const kept: string[] = [];
  let dropping = false;
  for (const line of text.slice(0, end).split(/(?<=\n)/)) {
    if (!/^[ \t]/.test(line)) dropping = /^bcc\s*:/i.test(line);
    if (!dropping) kept.push(line);
  }
  return new Uint8Array(Buffer.from(kept.join("") + text.slice(end), "binary"));
};

/** All recipients of the envelope: To, Cc and Bcc, each address once. */
export const recipientsOf = (...lists: ({ email: string }[] | null | undefined)[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const address of lists.flatMap((list) => list ?? [])) {
    const email = address.email.trim();
    if (email && !seen.has(email.toLowerCase())) {
      seen.add(email.toLowerCase());
      result.push(email);
    }
  }
  return result;
};
