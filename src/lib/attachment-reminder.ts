/**
 * "Anhang vergessen?": whether the own text of a mail speaks of an attachment. Only what the
 * user wrote counts, not the quoted mail below it (splitQuote in conversation.ts), where
 * "im Anhang" of the earlier mail would ask every time. Pure.
 */
import { FORWARD_MARKER } from "./compose";
import { splitQuote } from "./conversation";
import { htmlToText } from "./html";

/** German and English, as people write it: "anbei", "im Anhang", "attached" … */
const MENTIONS =
  /(?<!\p{L})(anh[aä]ng(?:e|en|s)?|dateianhang|anbei|beiliegend|anliegend|angeh[aä]ngt(?:e[nmrs]?)?|beigef[uü]gt(?:e[nmrs]?)?|attach(?:ed|ing|ment|ments)?|enclosed)(?!\p{L})/iu;

/**
 * A subject with "Re:", "AW:", "Fwd:" or "WG:" (prefixSubject in addresses.ts) was taken over from
 * the answered mail: an attachment it named was in that mail, not in this one.
 */
const TAKEN_OVER = /^\s*(re|aw|antw|fwd?|wg)\s*:/i;

/** The word that speaks of an attachment, in the subject or the text; none if nothing does. */
export const attachmentMention = (subject: string, text: string): string | undefined =>
  `${TAKEN_OVER.test(subject) ? "" : subject}\n${text}`.match(MENTIONS)?.[1];

/** Words only: the editor lays out a signature's lines a little differently than it came. */
const words = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * The text the user wrote in the composer's HTML: without the quoted reply, a forwarded mail or
 * the sender's `signature` (HTML), whose disclaimer ("… und etwaige Anhänge …") would ask every
 * time.
 */
export const ownText = (html: string, signature = ""): string => {
  const text = words(htmlToText(splitQuote(html).main));
  const forward = text.indexOf(FORWARD_MARKER);
  const own = forward < 0 ? text : text.slice(0, forward);
  const signed = words(htmlToText(signature));
  return signed ? own.replace(signed, "") : own;
};
