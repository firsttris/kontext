import { describe, expect, it } from "vitest";
import { legalFooterHtml, normalFooter, withLegalFooter, withoutLegalFooter } from "./legal-footer";

const FOOTER = "Weber Haustechnik GmbH · Sitz Freiburg\nAmtsgericht Freiburg HRB 1234";

describe("normalFooter", () => {
  it("unifies line ends, drops trailing blanks and runs of empty lines", () => {
    expect(normalFooter("  \r\nA  \r\nB\r\n\r\n\r\n\r\nC \n\n")).toBe("A\nB\n\nC");
  });

  it("is empty for blanks only", () => {
    expect(normalFooter(" \n \n")).toBe("");
  });
});

describe("legalFooterHtml", () => {
  it("escapes the text and keeps its lines and paragraphs", () => {
    const html = legalFooterHtml("Müller & Söhne <GmbH>\nSitz Köln\n\nUSt-IdNr. DE123");
    expect(html).toContain("Müller &amp; Söhne &lt;GmbH&gt;<br>Sitz Köln</p>");
    expect(html).toContain(">USt-IdNr. DE123</p>");
    expect(html).not.toContain("<GmbH>");
    expect(html.startsWith("<div data-legal-footer")).toBe(true);
  });
});

describe("withLegalFooter", () => {
  const mail = { subject: "Angebot", html: "<p>Hallo</p>", text: "Hallo" };

  it("puts the footer at the end of both parts", () => {
    const sent = withLegalFooter(mail, FOOTER);
    expect(sent.subject).toBe("Angebot");
    expect(sent.html).toBe(`<p>Hallo</p>${legalFooterHtml(FOOTER)}`);
    expect(sent.text).toBe(`Hallo\n\n${FOOTER}`);
  });

  it("leaves the mail as it is without a footer", () => {
    expect(withLegalFooter(mail, "")).toBe(mail);
    expect(withLegalFooter(mail, "  \n ")).toBe(mail);
    expect(withLegalFooter(mail, null)).toBe(mail);
  });

  it("gives an empty text the footer alone", () => {
    expect(withLegalFooter({ html: "", text: "" }, FOOTER).text).toBe(FOOTER);
  });
});

describe("withoutLegalFooter", () => {
  it("takes the footer out of a mail sent with it, and nothing else", () => {
    const sent = withLegalFooter({ html: "<p>Hallo</p><div>Gruß</div>", text: "" }, FOOTER);
    expect(withoutLegalFooter(sent.html)).toBe("<p>Hallo</p><div>Gruß</div>");
  });

  it("finds it with the attributes in another order and leaves a mail without one alone", () => {
    expect(withoutLegalFooter('<p>A</p><div style="x" data-legal-footer=""><p>B</p></div>')).toBe(
      "<p>A</p>",
    );
    expect(withoutLegalFooter("<p>A</p><div>B</div>")).toBe("<p>A</p><div>B</div>");
  });
});
