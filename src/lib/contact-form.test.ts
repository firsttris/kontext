import { describe, expect, it } from "vitest";
import { type ContactForm, emptyContactForm, formToCard, toForm } from "./contact-form";
import type { ContactCard } from "./jscontact";

/** A card as an iPhone sync or a vCard import leaves it: more than the form shows. */
const rich: ContactCard = {
  id: "c1",
  addressBookIds: { b: true },
  name: {
    full: "Dr. Petra Keller",
    components: [
      { kind: "title", value: "Dr." },
      { kind: "given", value: "Petra" },
      { kind: "given2", value: "Maria" },
      { kind: "surname", value: "Keller" },
    ],
    isOrdered: true,
  },
  organizations: {
    k1: { name: "Keller Elektro", units: [{ name: "Einkauf" }, { name: "Lager" }] },
  },
  titles: {
    t1: { name: "Bauleiterin", kind: "title" },
    r1: { name: "Ansprechpartnerin", kind: "role" },
  },
  emails: {
    e1: { address: "petra@keller.test", contexts: { work: true }, pref: 1 },
    e2: { address: "petra@privat.test", contexts: { private: true } },
  },
  phones: {
    p1: { number: "+49 7223 1", features: { voice: true }, contexts: { work: true } },
    p2: { number: "+49 170 2", features: { mobile: true, text: true }, pref: 1 },
    p3: { number: "+49 7223 9", features: { fax: true } },
  },
  addresses: {
    a1: {
      components: [
        { kind: "name", value: "Industriestraße" },
        { kind: "number", value: "4" },
        { kind: "postcode", value: "77815" },
        { kind: "locality", value: "Bühl" },
        { kind: "region", value: "Baden-Württemberg" },
        { kind: "country", value: "Deutschland" },
      ],
      countryCode: "DE",
      full: "Industriestraße 4, 77815 Bühl",
      contexts: { work: true },
    },
    a2: { components: [{ kind: "locality", value: "Baden-Baden" }] },
  },
  links: {
    w1: { uri: "https://keller-elektro.test" },
    "kontext-document-d1": { uri: "https://kontext.test/documents/edit/d1", label: "Angebot" },
  },
  anniversaries: {
    w: { kind: "wedding", date: { year: 2001, month: 6, day: 2 } },
    b: { kind: "birth", date: { year: 1974, month: 5, day: 4 } },
  },
  notes: { n1: { note: "Wartung" }, n2: { note: "Zweite Notiz" } },
  updated: "2026-01-01T00:00:00Z",
};

/** The card after saving the form: the patch replaces whole properties, as JMAP does. */
const saved = (form: ContactForm, card = rich): ContactCard =>
  Object.fromEntries(
    Object.entries({ ...card, ...formToCard(form, card) }).filter(([, v]) => v !== undefined),
  ) as ContactCard;

describe("reading a card into the form", () => {
  it("shows every number and address, the department, title, website and birthday", () => {
    expect(toForm(rich)).toEqual({
      given: "Petra",
      surname: "Keller",
      company: "Keller Elektro",
      department: "Einkauf",
      jobTitle: "Bauleiterin",
      emails: [
        { key: "e1", address: "petra@keller.test" },
        { key: "e2", address: "petra@privat.test" },
      ],
      phones: [
        { key: "p1", number: "+49 7223 1", kind: "work" },
        { key: "p2", number: "+49 170 2", kind: "mobile" },
        { key: "p3", number: "+49 7223 9", kind: "fax" },
      ],
      street: "Industriestraße 4",
      postcode: "77815",
      city: "Bühl",
      country: "Deutschland",
      website: "https://keller-elektro.test",
      birthday: "1974-05-04",
      note: "Wartung",
    });
  });
  it("splits the postcode Kontext used to write into the town", () => {
    const card: ContactCard = {
      id: "x",
      addressBookIds: {},
      addresses: { a: { components: [{ kind: "locality", value: "77815 Bühl" }] } },
    };
    expect(toForm(card)).toMatchObject({ postcode: "77815", city: "Bühl" });
  });
});

describe("writing the form into the card", () => {
  it("leaves the card as it is when nothing changed", () => {
    expect(formToCard(toForm(rich), rich)).toEqual({});
  });

  it("keeps the other numbers, mails, address parts and units when one field changes", () => {
    const form = toForm(rich);
    const card = saved({
      ...form,
      phones: form.phones.map((p) => (p.key === "p1" ? { ...p, number: "+49 7223 5" } : p)),
      city: "Bühl-Weitenung",
      department: "Vertrieb",
    });
    expect(card.phones).toEqual({
      ...rich.phones,
      p1: { ...rich.phones!.p1, number: "+49 7223 5" },
    });
    expect(card.emails).toEqual(rich.emails);
    expect(card.addresses).toEqual({
      a1: {
        components: [
          { kind: "name", value: "Industriestraße 4" },
          { kind: "postcode", value: "77815" },
          { kind: "locality", value: "Bühl-Weitenung" },
          { kind: "region", value: "Baden-Württemberg" },
          { kind: "country", value: "Deutschland" },
        ],
        countryCode: "DE",
        contexts: { work: true },
      },
      a2: rich.addresses!.a2,
    });
    expect(card.organizations).toEqual({
      k1: { name: "Keller Elektro", units: [{ name: "Vertrieb" }, { name: "Lager" }] },
    });
    for (const key of ["name", "titles", "links", "anniversaries", "notes"] as const)
      expect(card[key]).toEqual(rich[key]);
  });

  it("adds, removes and changes the kind of rows", () => {
    const form = toForm(rich);
    const card = saved({
      ...form,
      phones: [
        { ...form.phones[0]!, kind: "home" },
        form.phones[1]!,
        { number: "+49 7223 7", kind: "work" },
      ],
      emails: [...form.emails.slice(1), { address: "neu@keller.test" }],
    });
    expect(card.phones).toEqual({
      p1: { number: "+49 7223 1", features: { voice: true }, contexts: { private: true } },
      p2: rich.phones!.p2,
      p4: { number: "+49 7223 7", features: { voice: true }, contexts: { work: true } },
    });
    expect(card.emails).toEqual({
      e2: rich.emails!.e2,
      e3: { address: "neu@keller.test", contexts: { work: true } },
    });
  });

  it("keeps titles and middle names beside a new name, but not the old full name", () => {
    const card = saved({ ...toForm(rich), surname: "Keller-Braun" });
    expect(card.name).toEqual({
      components: [
        { kind: "title", value: "Dr." },
        { kind: "given", value: "Petra" },
        { kind: "surname", value: "Keller-Braun" },
        { kind: "given2", value: "Maria" },
      ],
      isOrdered: true,
    });
  });

  it("changes the title, website and birthday next to roles, documents and other days", () => {
    const card = saved({
      ...toForm(rich),
      jobTitle: "Geschäftsführerin",
      website: "keller.test",
      birthday: "1975-05-04",
      country: "Österreich",
    });
    expect(card.titles).toEqual({
      t1: { "@type": "Title", name: "Geschäftsführerin", kind: "title" },
      r1: rich.titles!.r1,
    });
    expect(card.links).toEqual({
      w1: { "@type": "Link", uri: "https://keller.test" },
      "kontext-document-d1": rich.links!["kontext-document-d1"],
    });
    expect(card.anniversaries).toEqual({
      w: rich.anniversaries!.w,
      b: {
        "@type": "Anniversary",
        kind: "birth",
        date: { "@type": "PartialDate", year: 1975, month: 5, day: 4 },
      },
    });
    // The country code would name the old country.
    expect(card.addresses?.a1?.countryCode).toBeUndefined();
  });

  it("removes only the edited entry when a field is emptied", () => {
    const card = formToCard({ ...toForm(rich), note: "", website: "", jobTitle: "" }, rich);
    expect(card.notes).toEqual({ n2: rich.notes!.n2 });
    expect(card.links).toEqual({ "kontext-document-d1": rich.links!["kontext-document-d1"] });
    expect(card.titles).toEqual({ r1: rich.titles!.r1 });
  });

  it("writes a new card", () => {
    expect(
      formToCard({
        ...emptyContactForm,
        given: " Eva ",
        surname: "Fischer",
        company: "Fischer Bau",
        department: "Technik",
        jobTitle: "Meisterin",
        emails: [{ address: "eva@fischer.test" }, { address: "" }],
        phones: [
          { number: "+49 170 1", kind: "mobile" },
          { number: "+49 7223 2", kind: "fax" },
        ],
        street: "Hauptstraße 1",
        postcode: "77815",
        city: "Bühl",
        country: "Deutschland",
        website: "https://fischer.test",
        birthday: "1980-02-29",
      }),
    ).toEqual({
      name: {
        components: [
          { kind: "given", value: "Eva" },
          { kind: "surname", value: "Fischer" },
        ],
        isOrdered: true,
      },
      organizations: { o1: { name: "Fischer Bau", units: [{ name: "Technik" }] } },
      titles: { t1: { "@type": "Title", kind: "title", name: "Meisterin" } },
      emails: { e1: { address: "eva@fischer.test", contexts: { work: true } } },
      phones: {
        p1: { number: "+49 170 1", features: { mobile: true } },
        p2: { number: "+49 7223 2", features: { fax: true } },
      },
      addresses: {
        a1: {
          components: [
            { kind: "name", value: "Hauptstraße 1" },
            { kind: "postcode", value: "77815" },
            { kind: "locality", value: "Bühl" },
            { kind: "country", value: "Deutschland" },
          ],
        },
      },
      links: { website1: { "@type": "Link", uri: "https://fischer.test" } },
      anniversaries: {
        birth1: {
          "@type": "Anniversary",
          kind: "birth",
          date: { "@type": "PartialDate", year: 1980, month: 2, day: 29 },
        },
      },
      notes: undefined,
    });
  });

  it("uses the company as name when no person is given", () => {
    expect(formToCard({ ...toForm(rich), given: "", surname: "" }, rich).name).toEqual({
      full: "Keller Elektro",
    });
  });
});
