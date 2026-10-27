import { describe, expect, it } from "vitest";
import type { Principal } from "@/jmap/principals";
import { colleagueAddresses, mergeSuggestions, withNames } from "./suggestions";

const anna: Principal = {
  id: "b",
  type: "individual",
  name: "anna",
  description: "Anna Weber",
  email: "anna@weber.test",
};
const info: Principal = { id: "c", type: "group", name: "info", email: "info@weber.test" };
const noMail: Principal = { id: "d", type: "individual", name: "lager" };

describe("colleagueAddresses", () => {
  it("takes the people with a mail address, by their display name", () => {
    expect(colleagueAddresses([anna, info, noMail])).toEqual([
      { name: "Anna Weber", email: "anna@weber.test" },
    ]);
  });
});

describe("mergeSuggestions", () => {
  it("keeps each address once, the first list winning regardless of case", () => {
    const colleagues = [{ name: "Anna Weber", email: "anna@weber.test" }];
    const contacts = [
      { name: "Anna (privat)", email: "Anna@Weber.test" },
      { name: "Petra Keller", email: "petra@keller.test" },
    ];
    expect(mergeSuggestions(colleagues, contacts)).toEqual([
      { name: "Anna Weber", email: "anna@weber.test" },
      { name: "Petra Keller", email: "petra@keller.test" },
    ]);
  });
});

describe("withNames", () => {
  it("names the known addresses, keeps a typed name and leaves the others bare", () => {
    expect(
      withNames(
        [
          { name: null, email: "ANNA@weber.test" },
          { name: "Petra Keller", email: "petra@keller.test" },
          { name: null, email: "kunde@example.test" },
        ],
        [
          { name: "Anna Weber", email: "anna@weber.test" },
          { name: "Petra (Kontakt)", email: "petra@keller.test" },
        ],
      ),
    ).toEqual([
      { name: "Anna Weber", email: "ANNA@weber.test" },
      { name: "Petra Keller", email: "petra@keller.test" },
      { name: null, email: "kunde@example.test" },
    ]);
  });
});
