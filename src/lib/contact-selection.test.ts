import { describe, expect, it } from "vitest";
import { byLetter, groupTargets, idsByAccount, withMembers } from "./contact-selection";
import type { ContactCard } from "./jscontact";

const person = (id: string, name: string, accountId = "a", uid: string | undefined = `u-${id}`) =>
  ({ id, uid, accountId, name: { full: name }, addressBookIds: {} }) as ContactCard & {
    accountId: string;
  };

const group = (id: string, name: string, members: string[], accountId = "a") =>
  ({
    ...person(id, name, accountId),
    kind: "group",
    members: Object.fromEntries(members.map((uid) => [uid, true])),
  }) as ContactCard & { accountId: string };

describe("contact selection", () => {
  it("lists the people by letter, sorted", () => {
    const letters = byLetter([
      person("1", "Zora Zink"),
      person("2", "Anna Arnold"),
      person("3", "Ali Alt"),
    ]);
    expect(letters.map(([letter, cards]) => [letter, cards.map((card) => card.id)])).toEqual([
      ["A", ["3", "2"]],
      ["Z", ["1"]],
    ]);
  });

  it("groups the ids per account", () => {
    expect(idsByAccount([person("1", "A"), person("2", "B", "b"), person("3", "C")])).toEqual([
      { accountId: "a", ids: ["1", "3"] },
      { accountId: "b", ids: ["2"] },
    ]);
  });

  it("offers the writable groups of the one account the picked contacts are in", () => {
    const cards = [
      group("g2", "Lieferanten", []),
      group("g1", "Kunden", []),
      group("g3", "Fremd", [], "b"),
      group("g4", "Gesperrt", []),
      person("1", "Anna"),
    ];
    const targets = groupTargets(
      [person("1", "Anna"), person("2", "Ben")],
      cards,
      (g) => g.id !== "g4",
    );
    expect(targets.map((g) => g.id)).toEqual(["g1", "g2"]);
  });

  it("offers no group across accounts or for a card without uid", () => {
    const cards = [group("g1", "Kunden", []), group("g2", "Kunden", [], "b")];
    expect(groupTargets([person("1", "A"), person("2", "B", "b")], cards, () => true)).toEqual([]);
    expect(groupTargets([{ ...person("1", "A"), uid: undefined }], cards, () => true)).toEqual([]);
  });

  it("adds the new members and keeps the old ones", () => {
    const kunden = group("g", "Kunden", ["u-1", "u-old"]);
    expect(withMembers(kunden, [person("1", "A"), person("2", "B"), person("2", "B")])).toEqual({
      members: { "u-1": true, "u-old": true, "u-2": true },
      added: 1,
    });
    expect(withMembers(kunden, [person("1", "A")]).added).toBe(0);
  });
});
