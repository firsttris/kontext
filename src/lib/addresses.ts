/** Parsing what people type into the To/Cc fields, and building reply recipients. */
import type { EmailAddress } from "@/jmap/types";

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

export const isEmail = (text: string): boolean => EMAIL.test(text.trim());

/** RFC 5322 §3.2.3 specials: a display name with one of them must be a quoted-string. */
const SPECIALS = /[()<>[\]:;@\\,."]/;

/** RFC 5322 §3.2.4: inside a quoted-string, `"` and `\` are escaped with a backslash. */
const quoteName = (name: string): string =>
  SPECIALS.test(name) ? `"${name.replace(/["\\]/g, "\\$&")}"` : name;

const unquoteName = (name: string): string => {
  const quoted = name.match(/^"((?:[^"\\]|\\.)*)"$/);
  return quoted ? quoted[1]!.replace(/\\(.)/g, "$1") : name.replace(/^"|"$/g, "");
};

/** "Petra Keller <petra@x.de>, info@y.de" → addresses; invalid parts are returned separately. */
export const parseAddresses = (input: string): { addresses: EmailAddress[]; invalid: string[] } => {
  const addresses: EmailAddress[] = [];
  const invalid: string[] = [];
  const parts = input.match(/("(?:[^"\\]|\\.)*"|[^,;])+/g) ?? [];
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    const angle = part.match(/^(.*)<([^>]+)>$/);
    const name = angle ? unquoteName(angle[1]!.trim()) : null;
    const email = (angle ? angle[2]! : part).trim();
    if (isEmail(email)) addresses.push({ name: name || null, email });
    else invalid.push(part);
  }
  return { addresses, invalid };
};

export const formatAddressInput = (addresses: EmailAddress[]): string =>
  addresses.map(({ name, email }) => (name ? `${quoteName(name)} <${email}>` : email)).join(", ");

export const sameAddress = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

const unique = (addresses: EmailAddress[], exclude: string[]): EmailAddress[] => {
  const seen = new Set(exclude.map((e) => e.toLowerCase()));
  return addresses.filter(({ email }) => {
    const key = email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

type Original = {
  from: EmailAddress[] | null;
  to: EmailAddress[] | null;
  cc: EmailAddress[] | null;
  replyTo: EmailAddress[] | null;
};

/** Reply goes to Reply-To or the sender; if I sent the original, to its recipients again. */
export const replyRecipients = (original: Original, myAddresses: string[], all: boolean) => {
  const fromMe = (original.from ?? []).some((a) =>
    myAddresses.some((mine) => sameAddress(mine, a.email)),
  );
  const primary = fromMe
    ? (original.to ?? [])
    : original.replyTo?.length
      ? original.replyTo
      : (original.from ?? []);
  const withoutMe = unique(primary, myAddresses);
  const to = withoutMe.length > 0 ? withoutMe : unique(primary, []);
  if (!all) return { to, cc: [] as EmailAddress[] };
  const others = fromMe ? (original.cc ?? []) : [...(original.to ?? []), ...(original.cc ?? [])];
  const cc = unique(others, [...myAddresses, ...to.map((a) => a.email)]);
  return { to, cc };
};

export const prefixSubject = (prefix: "Re" | "Fwd", subject: string | null): string => {
  const clean = (subject ?? "").trim();
  const pattern = prefix === "Re" ? /^(re|aw|antw)\s*:/i : /^(fwd?|wg)\s*:/i;
  return pattern.test(clean) ? clean : `${prefix}: ${clean}`;
};
