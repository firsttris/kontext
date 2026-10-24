import { describe, expect, it } from "vitest";
import { parseMailto, shareStart } from "./mailto";

describe("parseMailto", () => {
  it("reads recipients, copy, subject and text", () => {
    expect(
      parseMailto(
        "mailto:anna@firma.de,max@firma.de?cc=chef@firma.de&subject=Angebot%20Bad&body=Hallo%0Azusammen",
      ),
    ).toEqual({
      to: "anna@firma.de, max@firma.de",
      cc: "chef@firma.de",
      subject: "Angebot Bad",
      body: "Hallo\nzusammen",
    });
  });

  it("keeps a plus and takes recipients from to= as well", () => {
    expect(parseMailto("MAILTO:?to=info%2Bweb@firma.de&subject=C++")).toMatchObject({
      to: "info+web@firma.de",
      subject: "C++",
    });
    expect(parseMailto("mailto:a@b.de")).toEqual({ to: "a@b.de", cc: "", subject: "", body: "" });
    expect(parseMailto("mailto:a@b.de?subject=%E0%A4%A")).toMatchObject({ subject: "%E0%A4%A" });
  });
});

describe("shareStart", () => {
  it("makes title the subject and joins text and link once", () => {
    expect(shareStart({ title: "Schaden Bad", text: "Foto vom Wasserschaden", url: "" })).toEqual({
      to: "",
      cc: "",
      subject: "Schaden Bad",
      body: "Foto vom Wasserschaden",
    });
    expect(shareStart({ title: "", text: "Siehe", url: "https://x.de/a" }).body).toBe(
      "Siehe\n\nhttps://x.de/a",
    );
    expect(
      shareStart({ title: "", text: "Siehe https://x.de/a", url: "https://x.de/a" }).body,
    ).toBe("Siehe https://x.de/a");
  });
});
