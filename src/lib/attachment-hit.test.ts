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
