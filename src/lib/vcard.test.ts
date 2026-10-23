import { describe, expect, it } from "vitest";
import type { ContactCard } from "./jscontact";
import { foldLine, isDuplicate, normalizeMembers, splitVCards, toVCard } from "./vcard";

const petra: ContactCard = {
  id: "b",
  uid: "petra-keller",
  addressBookIds: { b: true },
  name: {
    components: [
      { kind: "given", value: "Petra" },
      { kind: "surname", value: "Keller" },
    ],
  },
  organizations: { o: { name: "Keller Elektro GmbH, Bühl" } },
  emails: { e: { address: "petra@keller.test", contexts: { work: true } } },
  phones: { p: { number: "+49 7223 81234", features: { mobile: true } } },
  addresses: {
    a: {
      components: [
        { kind: "name", value: "Industriestraße 4" },
        { kind: "locality", value: "Bühl" },
        { kind: "postcode", value: "77815" },
      ],
    },
  },
  notes: { n: { note: "Wartung; zweimal im Jahr\nimmer dienstags" } },
};

describe("vCard", () => {
  it("splits a file into cards", () => {
    const file =
      "BEGIN:VCARD\nVERSION:3.0\nFN:A\nEND:VCARD\n\nbegin:vcard\r\nVERSION:4.0\r\nFN:B\r\nend:vcard\r\n";
    expect(splitVCards(file)).toEqual([
      "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:A\r\nEND:VCARD\r\n",
      "begin:vcard\r\nVERSION:4.0\r\nFN:B\r\nend:vcard\r\n",
    ]);
    expect(splitVCards("no cards")).toEqual([]);
  });
  it("writes vCard 4.0 with escaped values", () => {
    const text = toVCard(petra);
    expect(text).toContain("BEGIN:VCARD\r\nVERSION:4.0\r\nUID:petra-keller\r\nFN:Petra Keller\r\n");
    expect(text).toContain("N:Keller;Petra;;;\r\n");
    expect(text).toContain("ORG:Keller Elektro GmbH\\, Bühl\r\n");
    expect(text).toContain("EMAIL;TYPE=work:petra@keller.test\r\n");
    expect(text).toContain("TEL;TYPE=cell:+49 7223 81234\r\n");
    expect(text).toContain("ADR:;;Industriestraße 4;Bühl;;77815;\r\n");
    expect(text).toContain(`${String.raw`NOTE:Wartung\; zweimal im Jahr\nimmer dienstags`}\r\n`);
    expect(text.endsWith("END:VCARD\r\n")).toBe(true);
  });
  it("writes groups with their members", () => {
    const group: ContactCard = {
      id: "g",
      uid: "lieferanten",
      addressBookIds: {},
      kind: "group",
      name: { full: "Lieferanten" },
      members: { "petra-keller": true },
    };
    const text = toVCard(group);
    expect(text).toContain("KIND:group\r\nFN:Lieferanten\r\n");
    expect(text).toContain("MEMBER:urn:uuid:petra-keller\r\n");
    expect(
      normalizeMembers(
        { ...group, members: { "urn:uuid:petra-keller": true } },
        new Set(["petra-keller"]),
      ).members,
    ).toEqual({ "petra-keller": true });
  });
  it("folds long lines at 75 octets", () => {
    const folded = foldLine(`NOTE:${"ä".repeat(60)}`);
    for (const line of folded.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(`NOTE:${"ä".repeat(60)}`);
  });
  it("finds duplicates by uid or by name and mail", () => {
    const copy = { ...petra, id: "x", uid: "other" };
    expect(isDuplicate(copy, [petra])).toBe(true);
    expect(isDuplicate({ ...petra, uid: "petra-keller", emails: {} }, [petra])).toBe(true);
    expect(isDuplicate({ ...copy, emails: { e: { address: "neu@x.test" } } }, [petra])).toBe(false);
  });
});
