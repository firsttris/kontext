import { describe, expect, it } from "vitest";
import {
  duplicateSetKey,
  findDuplicates,
  mergeCards,
  mergePlan,
  normalizePhone,
  relinkGroups,
} from "./contact-duplicates";
import type { ContactCard } from "./jscontact";

type Card = ContactCard & { accountId: string };

const person = (
  id: string,
  given: string,
  surname: string,
  extra: Partial<ContactCard> = {},
  accountId = "a",
): Card => ({
  id,
  uid: `uid-${id}`,
  accountId,
  addressBookIds: { b: true },
  name: {
    components: [
      { kind: "given", value: given },
      { kind: "surname", value: surname },
    ],
  },
  ...extra,
});

describe("normalizePhone", () => {
  it("compares numbers with and without the country code", () => {
    expect(normalizePhone("+49 7223 4711")).toBe("4972234711");
    expect(normalizePhone("0049 (7223) 4711")).toBe("4972234711");
    expect(normalizePhone("07223 / 47-11")).toBe("4972234711");
    expect(normalizePhone("+41 44 123")).toBe("4144123");
    expect(normalizePhone("+49 (0) 7223 4711")).toBe("4972234711");
  });
});

describe("findDuplicates", () => {
  it("finds the same mail address, phone number and name", () => {
    const sets = findDuplicates([
      person("1", "Petra", "Keller", { emails: { e: { address: "Petra@Keller.test" } } }),
      person("2", "P.", "Keller", { emails: { e: { address: "petra@keller.test " } } }),
      person("3", "Markus", "Hoffmann", { phones: { p: { number: "+49 7223 4711" } } }),
      person("4", "M.", "Hoffmann", { phones: { p: { number: "07223 4711" } } }),
      person("5", "Claudia", "Sommer"),
      person("6", "claudia ", " SOMMER"),
      person("7", "Thomas", "Lang"),
    ]);
    expect(sets.map((set) => set.cards.map((card) => card.id))).toEqual([
      ["1", "2"],
      ["3", "4"],
      ["5", "6"],
    ]);
    expect(sets.map((set) => set.reasons)).toEqual([["email"], ["phone"], ["name"]]);
  });

  it("joins chains into one set and names every reason", () => {
    const [set] = findDuplicates([
      person("1", "Petra", "Keller", { emails: { e: { address: "petra@keller.test" } } }),
      person("2", "Petra", "K.", {
        emails: { e: { address: "petra@keller.test" } },
        phones: { p: { number: "0170 1234567" } },
      }),
      person("3", "P", "Keller", { phones: { p: { number: "+49 170 1234567" } } }),
    ]);
    expect(set?.cards.map((card) => card.id)).toEqual(["1", "2", "3"]);
    expect(set?.reasons).toEqual(["email", "phone"]);
  });

  it("leaves groups, other accounts and short numbers alone", () => {
    expect(
      findDuplicates([
        person("1", "Petra", "Keller"),
        person("2", "Petra", "Keller", {}, "other"),
        { ...person("3", "", ""), kind: "group", name: { full: "Petra Keller" } },
        person("4", "Anna", "A", { phones: { p: { number: "110" } } }),
        person("5", "Bert", "B", { phones: { p: { number: "110" } } }),
      ]),
    ).toEqual([]);
  });

  it("does not match cards on their mail address shown as a name", () => {
    const nameless = (id: string): Card => ({ id, accountId: "a", addressBookIds: { b: true } });
    expect(findDuplicates([nameless("1"), nameless("2")])).toEqual([]);
  });
});

describe("mergeCards", () => {
  it("keeps the richest card and takes over what the others have", () => {
    const thin = person("1", "Petra", "Keller", {
      emails: { e: { address: "petra@keller.test" } },
      addressBookIds: { other: true },
    });
    const rich = person("2", "Petra", "Keller", {
      emails: { e: { address: "PETRA@keller.test" } },
      phones: { p: { number: "+49 7223 4711" } },
      organizations: { o: { name: "Keller Elektro" } },
    });
    const third = person("3", "P.", "Keller", {
      emails: { e: { address: "info@keller.test" } },
      phones: { p: { number: "07223 4711" } },
      notes: { n: { note: "Rückruf vormittags" } },
    });
    const { keep, patch, remove } = mergeCards([thin, rich, third]);
    expect(keep).toBe(rich);
    expect(remove).toEqual([thin, third]);
    expect(patch).toEqual({
      name: rich.name,
      organizations: { o: { name: "Keller Elektro" } },
      emails: { e: { address: "PETRA@keller.test" }, e2: { address: "info@keller.test" } },
      phones: { p: { number: "+49 7223 4711" } },
      notes: { n: { note: "Rückruf vormittags" } },
      addressBookIds: { b: true, other: true },
    });
  });
});

describe("mergeCards with more than the app edits", () => {
  it("keeps birthdays, nicknames and other properties of the removed cards", () => {
    const rich = person("1", "Petra", "Keller", {
      emails: { e: { address: "petra@keller.test" } },
      phones: { p: { number: "07223 4711" } },
      organizations: { o: { name: "Keller GmbH" } },
      nicknames: { n1: { name: "Pe" } },
    } as Partial<ContactCard>);
    const poor = {
      ...person("2", "Petra", "Keller", { emails: { e: { address: "petra@keller.test" } } }),
      anniversaries: { k1: { kind: "birth", date: { year: 1980, month: 5, day: 4 } } },
      nicknames: { n1: { name: "Pe" }, n2: { name: "Petty" } },
      keywords: { kunde: true },
      language: "de",
    } as Card;
    const { keep, patch } = mergeCards([rich, poor]);
    expect(keep).toBe(rich);
    expect(patch.anniversaries).toEqual({
      k1: { kind: "birth", date: { year: 1980, month: 5, day: 4 } },
    });
    expect(patch.nicknames).toEqual({ n1: { name: "Pe" }, n2: { name: "Petty" } });
    expect(patch.keywords).toEqual({ kunde: true });
    expect(patch.language).toBe("de");
    expect(patch).not.toHaveProperty("accountId");
    expect(patch).not.toHaveProperty("uid");
    expect(patch).not.toHaveProperty("id");
  });

  it("matches +49 (0) with the national number", () => {
    const cards = [
      person("1", "A", "A", { phones: { p: { number: "+49 (0) 7223 4711" } } }),
      person("2", "B", "B", { phones: { p: { number: "07223 4711" } } }),
    ];
    expect(findDuplicates(cards)).toHaveLength(1);
  });
});

describe("relinkGroups and mergePlan", () => {
  const group = (id: string, members: string[]): ContactCard => ({
    id,
    kind: "group",
    addressBookIds: { b: true },
    members: Object.fromEntries(members.map((uid) => [uid, true])),
  });

  it("points groups at the kept card", () => {
    const keep = person("1", "Petra", "Keller");
    const gone = person("2", "Petra", "Keller");
    expect(
      relinkGroups(
        [group("g1", ["uid-2", "uid-9"]), group("g2", ["uid-1", "uid-2"]), group("g3", ["x"])],
        [gone],
        keep,
      ),
    ).toEqual({
      g1: { members: { "uid-9": true, "uid-1": true } },
      g2: { members: { "uid-1": true } },
    });
  });

  it("merges several sets without losing a group change", () => {
    const sets = [
      [person("1", "Petra", "Keller"), person("2", "Petra", "Keller")],
      [person("3", "Markus", "Hoffmann"), person("4", "Markus", "Hoffmann")],
    ];
    const plan = mergePlan(sets, [group("g", ["uid-2", "uid-4"])]);
    expect(plan.destroy).toEqual(["2", "4"]);
    expect(plan.update.g).toEqual({ members: { "uid-1": true, "uid-3": true } });
    expect(Object.keys(plan.update).sort()).toEqual(["1", "3", "g"]);
  });

  it("names a set the same way in any order", () => {
    expect(duplicateSetKey([person("2", "", ""), person("1", "", "")])).toBe("a/1+a/2");
  });
});
