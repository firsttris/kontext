/**
 * "Anhang vergessen?": whether the own text of a mail speaks of an attachment. Only what the
 * user wrote counts, not the quoted mail below it (splitQuote in conversation.ts), where
 * "im Anhang" of the earlier mail would ask every time. Pure.
 */

/** German and English, as people write it: "anbei", "im Anhang", "attached" … */
const MENTIONS =
  /(?<!\p{L})(anh[aä]ng(?:e|en|s)?|dateianhang|anbei|beiliegend|anliegend|angeh[aä]ngt(?:e[nmrs]?)?|beigef[uü]gt(?:e[nmrs]?)?|attach(?:ed|ing|ment|ments)?|enclosed)(?!\p{L})/iu;

/** The word that speaks of an attachment, in the subject or the text; none if nothing does. */
export const attachmentMention = (subject: string, text: string): string | undefined =>
  `${subject}\n${text}`.match(MENTIONS)?.[1];
