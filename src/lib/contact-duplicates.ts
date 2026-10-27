/**
 * Duplicate contacts and how to merge them ("Zusammenführen und korrigieren"): cards of one
 * account that share a mail address, a phone number or the whole name become one card. The
 * richest card is kept and takes over what the others have; groups that listed one of the others
 * list the kept card instead (members are keyed by `uid`, RFC 9553 §2.1.6).
 */
import { memberUids } from "./groups";
import { type ContactCard, company, givenName, surname } from "./jscontact";

export type DuplicateReason = "email" | "phone" | "name";

export type DuplicateSet<T> = { cards: T[]; reasons: DuplicateReason[] };

/**
 * A phone number as digits with its country code, so "+49 7223 4711", "0049 7223 4711" and
 * "07223 / 4711" compare equal, and so does "+49 (0) 7223 4711". A national number without a code is taken as German: the first
 * users are German businesses.
 */
export const normalizePhone = (number: string): string => {
  // "+49 (0) 7223 4711": the bracketed 0 is only dialled within the country.
  const digits = number.replace(/\(\s*0\s*\)/g, "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits.slice(1).replace(/\+/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `49${digits.slice(1)}`;
  return digits;
};

const normalizeText = (text: string): string =>
  text.trim().replace(/\s+/g, " ").toLocaleLowerCase("de");

/** The name the card was given; unlike `fullName` never the mail address. */
const ownName = (card: ContactCard): string =>
  normalizeText(
    [givenName(card), surname(card)].filter(Boolean).join(" ") || card.name?.full || company(card),
  );

/** What makes two cards the same person, as `kind:value`. */
const identities = (card: ContactCard): string[] => [
  ...Object.values(card.emails ?? {})
    .map((email) => normalizeText(email.address))
    .filter(Boolean)
    .map((address) => `email:${address}`),
  ...Object.values(card.phones ?? {})
    .map((phone) => normalizePhone(phone.number))
    .filter((digits) => digits.length >= 6)
    .map((digits) => `phone:${digits}`),
  ...(ownName(card) ? [`name:${ownName(card)}`] : []),
];

/**
 * Sets of cards that are the same person, each set within one account (a card cannot move
 * between accounts with `ContactCard/set`). Groups are never duplicates. A chain counts: when A
 * and B share a mail address and B and C a phone number, all three are one set.
 */
export const findDuplicates = <T extends ContactCard & { accountId: string }>(
  cards: T[],
): DuplicateSet<T>[] => {
  const people = cards.filter((card) => card.kind !== "group");
  const parent = people.map((_, index) => index);
  const root = (index: number): number => {
    while (parent[index] !== index) index = parent[index]!;
    return index;
  };
  const firstWith = new Map<string, number>();
  const reasonsAt = new Map<number, Set<DuplicateReason>>();
  people.forEach((card, index) => {
    for (const identity of new Set(identities(card))) {
      const key = `${card.accountId}\n${identity}`;
      const other = firstWith.get(key);
      if (other === undefined) {
        firstWith.set(key, index);
        continue;
      }
      const reason = identity.slice(0, identity.indexOf(":")) as DuplicateReason;
      const [a, b] = [root(other), root(index)];
      const reasons = new Set([...(reasonsAt.get(a) ?? []), ...(reasonsAt.get(b) ?? []), reason]);
      parent[b] = a;
      reasonsAt.set(a, reasons);
    }
  });
  const sets = new Map<number, T[]>();
  people.forEach((card, index) => {
    const key = root(index);
    sets.set(key, [...(sets.get(key) ?? []), card]);
  });
  const order: DuplicateReason[] = ["email", "phone", "name"];
  return [...sets.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([key, members]) => ({
      cards: members,
      reasons: order.filter((reason) => reasonsAt.get(key)?.has(reason)),
    }));
};

/** The same set as text, for remembering that the user said it is no duplicate. */
export const duplicateSetKey = (cards: { accountId: string; id: string }[]): string =>
  cards
    .map((card) => `${card.accountId}/${card.id}`)
    .sort()
    .join("+");

/** How much a card holds; the richest card of a set is kept. */
const richness = (card: ContactCard): number =>
  [card.name, card.organizations, card.emails, card.phones, card.addresses, card.notes, card.links]
    .map((part) => (part ? Object.keys(part).length || 1 : 0))
    .reduce((sum, count) => sum + count, 0) + (card.uid ? 1 : 0);

/**
 * The entries of several records in one, the first record's first; an entry whose identity is
 * already there is left out. Keys stay where they are free, so other clients' references hold.
 */
const unite = <T>(
  records: (Record<string, T> | undefined)[],
  identity: (entry: T) => string,
  prefix: string,
): Record<string, T> | undefined => {
  const result: Record<string, T> = {};
  const seen = new Set<string>();
  for (const record of records) {
    for (const [key, entry] of Object.entries(record ?? {})) {
      const id = identity(entry);
      if (seen.has(id)) continue;
      seen.add(id);
      let free = key;
      for (let n = 2; free in result; n++) free = `${prefix}${n}`;
      result[free] = entry;
    }
  }
  return Object.keys(result).length ? result : undefined;
};

export type Merge<T> = {
  keep: T;
  /** The properties to write on the kept card. */
  patch: Record<string, unknown>;
  remove: T[];
};

/**
 * The other maps of a card (RFC 9553): their entries are united as they are, an entry that is
 * the same in two cards only once. Birthdays, nicknames, photos and the like stay this way.
 */
const ENTRY_MAPS = [
  "anniversaries",
  "calendars",
  "cryptoKeys",
  "directories",
  "media",
  "nicknames",
  "onlineServices",
  "personalInfo",
  "preferredLanguages",
  "schedulingAddresses",
  "titles",
];

/** Maps whose keys are what counts (`keywords`, related cards by uid): united by key. */
const KEY_MAPS = ["addressBookIds", "keywords", "relatedTo"];

/** What the server or the card itself sets (and the app's `accountId`); never taken over. */
const OWN = new Set([
  "accountId",
  "id",
  "uid",
  "@type",
  "version",
  "created",
  "updated",
  "prodId",
  "kind",
]);

type Props = Record<string, unknown>;

/** One card out of a set of duplicates. */
export const mergeCards = <T extends ContactCard>(cards: T[]): Merge<T> => {
  const keep = cards.reduce((best, card) => (richness(card) > richness(best) ? card : best));
  const all = [keep, ...cards.filter((card) => card !== keep)];
  const props = all as unknown as Props[];
  const handled = new Set([
    ...OWN,
    ...ENTRY_MAPS,
    ...KEY_MAPS,
    ...["name", "organizations", "emails", "phones", "addresses", "notes", "links"],
  ]);
  const others = [...new Set(props.flatMap(Object.keys))].filter((key) => !handled.has(key));
  const patch = {
    // Whatever else a card has (language, speakToAs …): the kept card's, else the first one's.
    ...Object.fromEntries(
      others.map((key) => [key, props.find((card) => card[key] !== undefined)?.[key]]),
    ),
    ...Object.fromEntries(
      ENTRY_MAPS.map((key) => [
        key,
        unite(
          props.map((card) => card[key] as Props | undefined),
          (entry) => JSON.stringify(entry),
          key.charAt(0),
        ),
      ]),
    ),
    ...Object.fromEntries(
      KEY_MAPS.map((key) => {
        const united = Object.assign({}, ...props.map((card) => card[key] ?? {}));
        return [key, Object.keys(united).length ? united : undefined];
      }),
    ),
    name: all.find((card) => card.name)?.name,
    organizations: unite(
      all.map((card) => card.organizations),
      (org) => normalizeText(org.name ?? ""),
      "o",
    ),
    emails: unite(
      all.map((card) => card.emails),
      (email) => normalizeText(email.address),
      "e",
    ),
    phones: unite(
      all.map((card) => card.phones),
      (phone) => normalizePhone(phone.number),
      "p",
    ),
    addresses: unite(
      all.map((card) => card.addresses),
      (address) => normalizeText(JSON.stringify(address.components ?? address.full ?? "")),
      "a",
    ),
    notes: unite(
      all.map((card) => card.notes),
      (note) => note.note.trim(),
      "n",
    ),
    links: unite(
      all.map((card) => card.links),
      (link) => link.uri,
      "l",
    ),
  };
  return {
    keep,
    patch: Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
    remove: all.slice(1),
  };
};

/**
 * The new members of every group that listed a removed card: the kept card instead (or nothing
 * more, when it has no `uid` to be listed by).
 */
export const relinkGroups = (
  groups: ContactCard[],
  removed: ContactCard[],
  keep: ContactCard,
): Record<string, { members: Record<string, boolean> }> => {
  const gone = new Set(removed.flatMap((card) => (card.uid ? [card.uid] : [])));
  return Object.fromEntries(
    groups
      .filter((group) => memberUids(group).some((uid) => gone.has(uid)))
      .map((group) => {
        const members = memberUids(group).filter((uid) => !gone.has(uid));
        if (keep.uid && !members.includes(keep.uid)) members.push(keep.uid);
        return [group.id, { members: Object.fromEntries(members.map((uid) => [uid, true])) }];
      }),
  );
};

export type MergePlan = {
  update: Record<string, Record<string, unknown>>;
  destroy: string[];
};

/**
 * Everything to write to merge several sets of one account at once. The groups are worked
 * through set after set, so a group holding people of two sets keeps both kept cards.
 */
export const mergePlan = (sets: ContactCard[][], groups: ContactCard[]): MergePlan => {
  let current = groups;
  const plan: MergePlan = { update: {}, destroy: [] };
  for (const cards of sets) {
    const { keep, patch, remove } = mergeCards(cards);
    const relinked = relinkGroups(current, remove, keep);
    current = current.map((group) => ({ ...group, ...relinked[group.id] }));
    Object.assign(plan.update, relinked, { [keep.id]: patch });
    plan.destroy.push(...remove.map((card) => card.id));
  }
  return plan;
};
