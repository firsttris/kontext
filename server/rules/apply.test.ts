import { describe, expect, it } from "vitest";
import { factsOf, patchFor } from "./apply";
import type { Rule } from "./script";

const rule = (patch: Partial<Rule> = {}): Rule => ({
  id: "r",
  name: "",
  enabled: true,
  match: "all",
  conditions: [{ field: "subject", operator: "contains", value: "Lieferschein" }],
  moveTo: { id: "archive", path: "Archive" },
  markRead: true,
  flag: false,
  forwardTo: "nie@example.test",
  stop: false,
  ...patch,
});

const mail = {
  id: "e1",
  from: [{ email: "lager@grosshandel.example" }],
  to: [{ email: "anna@firma.de" }],
  cc: null,
  subject: "Lieferschein 4711",
  textBody: [{ partId: "1" }],
  bodyValues: { "1": { value: "Anbei" } },
};

describe("factsOf", () => {
  it("takes addresses without names, to and cc together, and the text parts", () => {
    expect(factsOf({ ...mail, cc: [{ email: "info@firma.de" }] })).toEqual({
      from: ["lager@grosshandel.example"],
      to: ["anna@firma.de", "info@firma.de"],
      subject: "Lieferschein 4711",
      body: "Anbei",
    });
  });
});

describe("patchFor", () => {
  const folders = new Set(["inbox", "archive"]);

  it("moves out of the inbox and marks, but never forwards", () => {
    expect(patchFor([rule()], mail, "inbox", folders)).toEqual({
      "mailboxIds/inbox": null,
      "mailboxIds/archive": true,
      "keywords/$seen": true,
    });
  });

  it("leaves a mail alone that no rule matches, or a folder that is gone", () => {
    expect(patchFor([rule()], { ...mail, subject: "Hallo" }, "inbox", folders)).toBeNull();
    expect(
      patchFor(
        [rule({ moveTo: { id: "gone", path: "Weg" }, markRead: false })],
        mail,
        "inbox",
        folders,
      ),
    ).toBeNull();
  });
});
