/**
 * When someone leaves: their mail goes to a colleague (Sieve `redirect`, RFC 5228) and senders
 * get one reply a day (`vacation`, RFC 5230). One script, because Stalwart runs only one active
 * script per account. Pure functions.
 */

export const OFFBOARDING_SCRIPT = "kontext-austritt";

export type Offboarding = {
  /** Address that gets every new mail instead of the old mailbox. */
  forwardTo: string | null;
  /** The automatic answer, or none. */
  reply: { subject: string; text: string } | null;
};

/** A Sieve quoted string (RFC 5228 §2.4.2): backslash and quote escaped. */
const quoted = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** The script, or null when there is nothing to do. */
export const offboardingScript = ({ forwardTo, reply }: Offboarding): string | null => {
  if (!forwardTo && !reply) return null;
  const lines = [
    ...(reply ? ['require ["vacation"];'] : []),
    ...(reply ? [`vacation :days 1 :subject ${quoted(reply.subject)} ${quoted(reply.text)};`] : []),
    ...(forwardTo ? [`redirect ${quoted(forwardTo)};`] : []),
  ];
  return `${lines.join("\n")}\n`;
};
