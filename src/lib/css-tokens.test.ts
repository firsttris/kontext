import { describe, expect, it } from "vitest";
import { tokenizeCss } from "./css-tokens";

const kinds = (css: string) =>
  tokenizeCss(css)
    .filter(({ type }) => type !== "whitespace" && type !== "other")
    .map((token) =>
      token.type === "url" && token.bad
        ? "bad-url"
        : "value" in token
          ? `${token.type}:${token.value}`
          : token.type,
    );

describe("tokenizeCss (CSS Syntax 3)", () => {
  it("keeps the source, so joining the tokens gives the input back", () => {
    const css = `a{b:url( x.png ) "s\\"" /* c */ \\75rl(y)}`;
    expect(
      tokenizeCss(css)
        .map(({ text }) => text)
        .join(""),
    ).toBe(css);
  });
  it("reads url tokens, quoted url functions and escaped names", () => {
    expect(kinds(`url( a.png ) url("b.png") \\75 rl(c.png) URL(d)`)).toEqual([
      "url:a.png",
      "function",
      "string:b.png",
      "url:c.png",
      "url:d",
    ]);
  });
  it("ends strings and urls at the end of input, a string at a newline as bad", () => {
    expect(kinds(`url(a.png`)).toEqual(["url:a.png"]);
    expect(kinds(`'a`)).toEqual(["string:a"]);
    expect(kinds(`'a\nb'`).at(0)).toBe("bad-string");
  });
  it("continues a string over an escaped newline, CR or form feed", () => {
    expect(kinds(`'a\\\fb' 'c\\\r\nd'`)).toEqual(["string:ab", "string:cd"]);
  });
  it("reads escapes as code points, U+FFFD where there is none", () => {
    expect(kinds(`'\\68\\0 \\110000\\d800'`)).toEqual(["string:h���"]);
  });
  it("hides nothing in comments and treats a bad url as such", () => {
    expect(kinds(`/*"*/'x'/*"*/ url(a b)`)).toEqual(["comment", "string:x", "comment", "bad-url"]);
  });
});
