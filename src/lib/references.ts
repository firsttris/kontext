/**
 * The References of a reply: the parent's References followed by the parent's Message-ID
 * (RFC 5322 §3.6.4). Each id appears once, in order: a reply saved as draft already carries the
 * parent at the end, and opening it again must not add the parent a second time.
 */
export const replyReferences = (
  references: readonly string[] | null | undefined,
  inReplyTo: readonly string[] | null | undefined,
): string[] => [...new Set([...(references ?? []), ...(inReplyTo ?? [])])];
