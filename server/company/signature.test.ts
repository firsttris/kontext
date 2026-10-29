import { describe, expect, it } from "vitest";
import { signaturePatches } from "./signature";

describe("signaturePatches", () => {
  it("fills name and address per sender, escaped in HTML", () => {
    const patches = signaturePatches(
      { html: "<p>[Name]<br>[E-Mail]</p><p>Weber Haustechnik</p>", text: "[Name]\n[E-Mail]" },
      [
        { id: "a", name: "Anna <Büro>", email: "anna@firma.de" },
        { id: "b", name: "Anna", email: "info@firma.de" },
      ],
    );
    expect(patches).toEqual({
      a: {
        htmlSignature: "<p>Anna &#60;Büro&#62;<br>anna@firma.de</p><p>Weber Haustechnik</p>",
        textSignature: "Anna <Büro>\nanna@firma.de",
      },
      b: {
        htmlSignature: "<p>Anna<br>info@firma.de</p><p>Weber Haustechnik</p>",
        textSignature: "Anna\ninfo@firma.de",
      },
    });
  });
});

describe("signature details", () => {
  const anna = [{ id: "a", name: "Anna Weber", email: "anna@weber.test" }];
  const details = { phone: "07223 4711-12", mobile: "", position: "Büro", department: "" };

  it("fills phone, mobile, position and department and drops lines left empty (text)", () => {
    const text =
      "[Name]\n[Position] · [Abteilung]\nTel. [Telefon]\nMobil [Mobil]\n\nWeber Haustechnik";
    expect(signaturePatches({ html: "", text }, anna, details).a?.textSignature).toBe(
      "Anna Weber\nTel. 07223 4711-12\n\nWeber Haustechnik",
    );
  });

  it("drops a line of a paragraph with its <br>, and a paragraph of nothing else (HTML)", () => {
    const html =
      "<p>[Name]<br>[Position]<br>Mobil [Mobil]</p><p><strong>Abteilung:</strong> [Abteilung]</p><p></p><p>Tel. [Telefon]</p>";
    expect(signaturePatches({ html, text: "" }, anna, details).a?.htmlSignature).toBe(
      "<p>Anna Weber<br>Büro</p><p></p><p>Tel. 07223 4711-12</p>",
    );
  });

  it("drops a first line too and escapes what people entered", () => {
    expect(
      signaturePatches({ html: "<p>Mobil [Mobil]<br>[Position]</p>", text: "" }, anna, {
        ...details,
        position: "Chef <&> Büro",
      }).a?.htmlSignature,
    ).toBe("<p>Chef &#60;&#38;&#62; Büro</p>");
  });

  it("keeps everything as it was without placeholders of details", () => {
    expect(
      signaturePatches({ html: "<p>[Name]</p><p></p><p>Weber</p>", text: "[Name]" }, anna).a,
    ).toEqual({
      htmlSignature: "<p>Anna Weber</p><p></p><p>Weber</p>",
      textSignature: "Anna Weber",
    });
  });
});

describe("signature details, review", () => {
  const anna = [{ id: "a", name: "Anna Weber", email: "anna@weber.test" }];

  it("keeps a heading before a line that goes", () => {
    const html = "<h3>Weber Haustechnik</h3><p>Mobil [Mobil]<br>[Name]</p>";
    expect(signaturePatches({ html, text: "" }, anna).a?.htmlSignature).toBe(
      "<h3>Weber Haustechnik</h3><p>Anna Weber</p>",
    );
  });
});
