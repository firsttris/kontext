/**
 * Hinweis „Extern“: which addresses lie outside the company. Inside are the company's own mail
 * domains (Stalwart's `x:Domain`) and the partner domains the Firmenverwaltung named, each with
 * its subdomains ("firma.de" also covers "mail.firma.de"). Pure.
 */

/** A domain as people type it: trimmed, lower case, without "@" or a trailing dot. */
export const normalDomain = (text: string): string =>
  text.trim().toLowerCase().replace(/^@+/, "").replace(/\.$/, "");

/** Letters, digits and hyphens in at least two labels; what a mail domain can be. */
const DOMAIN =
  /^(?=.{1,253}$)(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+[\p{L}\p{N}-]{2,63}$/u;

export const isDomain = (text: string): boolean => DOMAIN.test(normalDomain(text));

/**
 * The domains in a text the admin typed (one per line, or separated by commas or spaces), each
 * once; `invalid` holds what is no domain, to be named back.
 */
export const parseDomains = (text: string): { domains: string[]; invalid: string[] } => {
  const parts = text
    .split(/[\s,;]+/)
    .map(normalDomain)
    .filter(Boolean);
  const unique = [...new Set(parts)];
  return {
    domains: unique.filter((part) => DOMAIN.test(part)),
    invalid: unique.filter((part) => !DOMAIN.test(part)),
  };
};

/** The domain of an address, lower case; empty for something without "@". */
export const domainOf = (address: string): string => {
  const at = address.lastIndexOf("@");
  return at < 0 ? "" : normalDomain(address.slice(at + 1));
};

/** Whether `domain` is one of `inside` or below one of them. */
const coveredBy = (domain: string, inside: readonly string[]): boolean =>
  inside.some((own) => domain === own || domain.endsWith(`.${own}`));

/**
 * Whether an address lies outside the company. An address without a domain (a broken header)
 * gets no mark: the hint is about where mail goes, not about broken mails.
 */
export const isExternal = (address: string, inside: readonly string[]): boolean => {
  const domain = domainOf(address);
  return domain !== "" && !coveredBy(domain, inside.map(normalDomain));
};

/** The addresses outside the company, each once and in the order given. */
export const externalAddresses = (
  addresses: readonly string[],
  inside: readonly string[],
): string[] => {
  const seen = new Set<string>();
  return addresses.filter((address) => {
    const key = address.trim().toLowerCase();
    if (seen.has(key) || !isExternal(key, inside)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * The attendees an invitation would newly reach outside the company: those asked about before
 * (already invited when the appointment was opened) are not asked about again.
 */
export const newExternalAttendees = (
  attendees: readonly string[],
  invitedBefore: readonly string[],
  inside: readonly string[],
): string[] => {
  const before = new Set(invitedBefore.map((address) => address.trim().toLowerCase()));
  return externalAddresses(attendees, inside).filter(
    (address) => !before.has(address.trim().toLowerCase()),
  );
};
