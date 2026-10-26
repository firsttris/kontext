/**
 * Whether a mail's pictures from the internet load at once: only for a sender one trusts, and only
 * if the mail really comes from them – a mail from outside confirmed for that domain (DMARC, or
 * SPF/DKIM aligned); one without any check (imported, or from a colleague inside) counts too, a
 * failed one never. Pure.
 */
import { fromSender } from "./sender-check";

export type ImageState = "load" | "unconfirmed" | "ask";

export const imageState = (
  trusted: boolean,
  sender: string,
  authenticationResults: string[] | null | undefined,
): ImageState => {
  if (!trusted) return "ask";
  return fromSender(sender, authenticationResults) ? "load" : "unconfirmed";
};
