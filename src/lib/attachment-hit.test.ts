import { describe, expect, it } from "vitest";
import { foundInAttachment } from "./attachment-hit";

const email = {
  from: [{ name: "Erika Kunde", email: "erika@kunde.test" }],
  to: [{ name: null, email: "info@weber-haustechnik.test" }],
};

describe("foundInAttachment", () => {
  it("is a hit in an attachment when neither subject, text nor an address has the word", () => {
    expect(
      foundInAttachment(["zebrafink"], { ...email, snippet: { subject: null, preview: null } }),
    ).toBe(true);
  });

  it("is not when the subject or the text has it", () => {
    const marked = "Das <mark>Zebrafink</mark>-Angebot";
    expect(
      foundInAttachment(["zebrafink"], { ...email, snippet: { subject: marked, preview: null } }),
    ).toBe(false);
    expect(
      foundInAttachment(["zebrafink"], { ...email, snippet: { subject: null, preview: marked } }),
    ).toBe(false);
  });

  it("is not when an address has it, nor without free words or a snippet", () => {
    const none = { ...email, snippet: { subject: null, preview: null } };
    expect(foundInAttachment(["erika"], none)).toBe(false);
    expect(foundInAttachment(["Kunde.test"], none)).toBe(false);
    expect(foundInAttachment([], none)).toBe(false);
    expect(foundInAttachment(["zebrafink"], email)).toBe(false);
  });
});

describe("foundInAttachment, where Stalwart finds the word elsewhere", () => {
  const none = { subject: null, preview: null };

  it("is not for a mail without attachments (a stemmed hit in the text that the snippet does not mark)", () => {
    // Stalwart 1.0.1 finds "Haus" in "Wir bauen drei Häuser" and marks nothing (checked live).
    expect(foundInAttachment(["dach"], { ...email, hasAttachment: false, snippet: none })).toBe(
      false,
    );
  });

  it("is not when Cc or Bcc has the word (Stalwart's text filter searches them)", () => {
    const cc = [{ name: "Kranich Vogel", email: "vogel@example.test" }];
    expect(
      foundInAttachment(["kranich"], { ...email, hasAttachment: true, cc, snippet: none }),
    ).toBe(false);
    expect(
      foundInAttachment(["kranich"], { ...email, hasAttachment: true, bcc: cc, snippet: none }),
    ).toBe(false);
  });
});
