import { describe, expect, it } from "vitest";
import { type CsvField, csvCards, csvDate, guessField, rowToForm } from "./csv-contacts";

describe("guessField", () => {
  it.each<[string, CsvField]>([
    ["Vorname", "given"],
    ["First Name", "given"],
    ["Given Name", "given"],
    ["Nachname", "surname"],
    ["Last Name", "surname"],
    ["Firma", "company"],
    ["Organization 1 - Name", "company"],
    ["Abteilung", "department"],
    ["Position", "jobTitle"],
    ["Job Title", "jobTitle"],
    ["E-Mail", "email"],
    ["E-mail Address", "email"],
    ["E-mail 2 Address", "email"],
    ["E-Mail-Adresse", "email"],
    ["E-Mail 2: Adresse", "email"],
    ["E-mail 1 - Value", "email"],
    ["E-mail Display Name", "skip"],
    ["E-mail 1 - Type", "skip"],
    ["Telefon", "phone:work"],
    ["Geschäftlich Telefon", "phone:work"],
    ["Telefon geschäftlich", "phone:work"],
    ["Business Phone", "phone:work"],
    ["Phone 1 - Value", "phone:work"],
    ["Mobile Phone", "phone:mobile"],
    ["Mobiltelefon", "phone:mobile"],
    ["Handy", "phone:mobile"],
    ["Home Phone", "phone:home"],
    ["Telefon privat", "phone:home"],
    ["Fax", "phone:fax"],
    ["Business Fax", "phone:fax"],
    ["Fax geschäftlich", "phone:fax"],
    ["Straße", "street"],
    ["Straße geschäftlich", "street"],
    ["Business Street", "street"],
    ["Address 1 - Street", "street"],
    ["PLZ", "postcode"],
    ["Postleitzahl geschäftlich", "postcode"],
    ["Business Postal Code", "postcode"],
    ["Ort", "city"],
    ["Business City", "city"],
    ["Land/Region geschäftlich", "country"],
    ["Business Country/Region", "country"],
    ["Web Page", "website"],
    ["Geburtstag", "birthday"],
    ["Birthday", "birthday"],
    ["Notizen", "note"],
    ["Notes", "note"],
    ["Kundennummer", "skip"],
    // Google Contacts' current export has no number here (seen in real exports, e.g.
    // RockGTR/Contact_Fixer docs/contacts.csv on GitHub).
    ["Organization Name", "company"],
    ["Organization Title", "jobTitle"],
    ["Organization Department", "department"],
  ])("%s → %s", (header, field) => {
    expect(guessField(header)).toBe(field);
  });
});

describe("csvDate", () => {
  it("reads ISO, German and US dates", () => {
    expect(csvDate("1980-12-24")).toBe("1980-12-24");
    expect(csvDate("4.7.1975")).toBe("1975-07-04");
    expect(csvDate("7/4/1975")).toBe("1975-07-04");
  });

  it("gives nothing for a day or month out of range, as a British 30/07/2000", () => {
    expect(csvDate("30/07/2000")).toBe("");
    expect(csvDate("1980-13-01")).toBe("");
    expect(csvDate("32.01.1980")).toBe("");
  });

  it("gives nothing for what is no date, as Outlook's empty 0.0.00", () => {
    expect(csvDate("0.0.00")).toBe("");
    expect(csvDate("im Sommer")).toBe("");
  });
});

describe("rowToForm", () => {
  const mapping: CsvField[] = [
    "given",
    "surname",
    "email",
    "email",
    "phone:mobile",
    "street",
    "street",
    "birthday",
    "skip",
  ];

  it("adds up mails and numbers and keeps a text field's first value", () => {
    const row = [
      " Jürgen ",
      "Groß",
      "j@gross.test",
      "privat@gross.test",
      "0170 123",
      "",
      "Hauptstr. 1",
      "24.12.1980",
      "K-17",
    ];
    expect(rowToForm(row, mapping)).toMatchObject({
      given: "Jürgen",
      surname: "Groß",
      emails: [{ address: "j@gross.test" }, { address: "privat@gross.test" }],
      phones: [{ number: "0170 123", kind: "mobile" }],
      street: "Hauptstr. 1",
      birthday: "1980-12-24",
    });
  });
});

describe("csvCards", () => {
  it("writes the cards as the editor does and leaves out rows without a name or mail", () => {
    const mapping: CsvField[] = ["company", "given", "surname", "phone:work", "city"];
    const cards = csvCards(
      [
        ["Bäckerei Groß", "Jürgen", "Groß", "07223 1", "Bühl"],
        ["", "", "", "07223 2", "Achern"],
      ],
      mapping,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      kind: "individual",
      name: {
        components: [
          { kind: "given", value: "Jürgen" },
          { kind: "surname", value: "Groß" },
        ],
      },
      organizations: { o1: { name: "Bäckerei Groß" } },
      phones: { p1: { number: "07223 1", contexts: { work: true } } },
      addresses: { a1: { components: [{ kind: "locality", value: "Bühl" }] } },
    });
  });
});

describe("Google Contacts CSV", () => {
  // As Google writes it: several values of one label in one cell, joined by " ::: ", and the kind
  // of a number in the "Phone n - Label" column next to it.
  const header = [
    "First Name",
    "Last Name",
    "E-mail 1 - Label",
    "E-mail 1 - Value",
    "Phone 1 - Label",
    "Phone 1 - Value",
    "Phone 2 - Label",
    "Phone 2 - Value",
    "Phone 3 - Label",
    "Phone 3 - Value",
  ];
  const row = [
    "Clara",
    "Novak",
    "* Home",
    "clara.novak@example.net ::: clara@novak.example",
    "Mobile",
    "+49 170 1234567 ::: 0171 7654321",
    "Home Fax",
    "07223 99",
    "Work",
    "07223 1",
  ];

  it("splits the values of one cell", () => {
    const form = rowToForm(row, header.map(guessField));
    expect(form.emails).toEqual([
      { address: "clara.novak@example.net" },
      { address: "clara@novak.example" },
    ]);
    expect(form.phones.map((phone) => phone.number)).toEqual([
      "+49 170 1234567",
      "0171 7654321",
      "07223 99",
      "07223 1",
    ]);
  });

  it("takes the kind of a number from its label", () => {
    const form = rowToForm(row, header.map(guessField), header);
    expect(form.phones.map((phone) => phone.kind)).toEqual(["mobile", "mobile", "fax", "work"]);
  });
});
