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
