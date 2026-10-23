import { describe, expect, it } from "vitest";
import {
  groupAddresses,
  groupSuggestions,
  groupsOf,
  groupToCard,
  isGroup,
  membersOf,
  memberUids,
} from "./groups";
import type { ContactCard } from "./jscontact";

const person = (uid: string, given: string, surname: string, email?: string): ContactCard => ({
  id: uid,
  uid,
  addressBookIds: { b: true },
  name: {
    components: [
      { kind: "given", value: given },
      { kind: "surname", value: surname },
    ],
  },
  ...(email ? { emails: { e: { address: email } } } : {}),
});

const petra = person("petra", "Petra", "Keller", "petra@keller.test");
const markus = person("markus", "Markus", "Hoffmann", "m@hoffmann.test");
const ohneMail = person("ohne", "Otto", "Ohnemail");
const group: ContactCard = {
  id: "g",
  uid: "lieferanten",
  addressBookIds: { b: true },
  kind: "group",
  name: { full: "Lieferanten" },
  members: { petra: true, ohne: true, unbekannt: true, markus: false },
};
const cards = [petra, markus, ohneMail, group];

describe("groups", () => {
  it("recognises groups and their members", () => {
    expect(isGroup(group)).toBe(true);
    expect(isGroup(petra)).toBe(false);
    expect(memberUids(group)).toEqual(["petra", "ohne", "unbekannt"]);
    expect(membersOf(group, cards).map((c) => c.uid)).toEqual(["petra", "ohne"]);
    expect(groupsOf(petra, [group])).toEqual([group]);
    expect(groupsOf(markus, [group])).toEqual([]);
  });
  it("writes a group card", () => {
    expect(groupToCard(" Kunden Bühl ", ["a", "b"])).toEqual({
      kind: "group",
      name: { full: "Kunden Bühl" },
      members: { a: true, b: true },
    });
  });
  it("suggests a group with the members' addresses", () => {
    expect(groupAddresses(group, cards)).toEqual([
      { name: "Petra Keller", email: "petra@keller.test" },
    ]);
    expect(groupSuggestions(cards)).toEqual([
      {
        name: "Lieferanten",
        email: "gruppe:lieferanten",
        members: [{ name: "Petra Keller", email: "petra@keller.test" }],
      },
    ]);
  });
});
