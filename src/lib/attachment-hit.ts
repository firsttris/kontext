/**
 * Whether a search hit lies in an attachment. Stalwart 1.0 searches the text of attachments (PDF,
 * Word, Excel, PowerPoint, OpenDocument, EPUB, RTF) with the `text` filter, and its SearchSnippet
 * marks only subject and body (crates/jmap/src/email/snippet.rs): a hit for a free word with
 * neither marked, and the word in no address either, was found in an attachment. Pure.
 */
import type { EmailAddress } from "@/jmap/types";

/** SearchSnippet/get for one mail (RFC 8621 §5): the marked subject and text, or null. */
export type Snippet = { subject: string | null; preview: string | null };

type Hit = {
  from: EmailAddress[] | null;
  to: EmailAddress[] | null;
  snippet?: Snippet;
};

const inAddresses = (hit: Hit, word: string) =>
  [...(hit.from ?? []), ...(hit.to ?? [])].some((address) =>
    `${address.name ?? ""} ${address.email}`.toLowerCase().includes(word),
  );

/** `words`: the free words of the search (only they are searched in attachments). */
export const foundInAttachment = (words: string[], hit: Hit): boolean =>
  words.length > 0 &&
  Boolean(hit.snippet) &&
  !hit.snippet?.subject &&
  !hit.snippet?.preview &&
  !words.some((word) => inAddresses(hit, word.toLowerCase()));
