/**
 * Whether a key (OpenPGP) or certificate (S/MIME) may take the place of the one kept for an
 * address. One that came along in a mail is the sender's word only: it never replaces one that
 * someone imported or looked up (WKD, key server, DNS, a colleague), or a forged sender could swap
 * the key that checks signatures and that replies are encrypted to. Pure.
 */
export const mayReplace = (
  current: { fingerprint: string; source: string } | undefined,
  incoming: { fingerprint: string; source: string },
  fromMail: string,
): boolean =>
  !current ||
  current.fingerprint === incoming.fingerprint ||
  incoming.source !== fromMail ||
  current.source === fromMail;
