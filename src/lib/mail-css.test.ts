import { describe, expect, it } from "vitest";
import { cleanCss } from "./mail-css";

const blocked = (css: string, rules = true) =>
  cleanCss(css, { allowRemote: false, cidUrls: {}, rules });

describe("cleanCss", () => {
  it("drops @import while blocked, up to its end, and keeps what follows", () => {
    expect(blocked(`@import url(a.css) screen;p{color:red}`)).toEqual({
      css: "p{color:red}",
      blocked: 1,
    });
    expect(blocked(`@import url("a.css") screen;p{color:red}`).css).toBe("p{color:red}");
    expect(blocked(`@media print{@IMPORT "a.css"}p{color:red}`).css).toBe(
      "@media print{}p{color:red}",
    );
  });
  it("leaves @import as text in an attribute, which holds no rules", () => {
    expect(blocked(`@import foo; bar`, false)).toEqual({ css: "@import foo; bar", blocked: 0 });
  });
  it("keeps data: URLs, which fetch nothing (a data: stylesheet comes only by @import)", () => {
    const font = `@font-face{src:url(data:font/woff2;base64,AA) format("woff2")}`;
    expect(blocked(font)).toEqual({ css: font, blocked: 0 });
  });
  it("empties remote strings only where CSS fetches them", () => {
    expect(blocked(`a::after{content:"https://x.test"}`).css).toBe(
      `a::after{content:"https://x.test"}`,
    );
    expect(blocked(`a{b:image(ltr "https://x.test/a.png")}`).css).toBe(`a{b:image(ltr "")}`);
    expect(blocked(`a{b:cross-fade(50% "https://x.test/a.png", red)}`).blocked).toBe(1);
    // A custom property carries its string into image-set() through var().
    expect(blocked(`a{--u: "https://x.test/a.png"; b:image-set(var(--u) 1x)}`).css).toBe(
      `a{--u: ""; b:image-set(var(--u) 1x)}`,
    );
    expect(blocked(`--u:"https://x.test/a.png"`, false).blocked).toBe(1);
  });
  it("gives back unchanged text exactly as written", () => {
    const css = "a{b:c}\r\n\f\0d{e:'f\\\r\ng'}";
    expect(blocked(css).css).toBe(css);
  });
  it("takes linear time for many quoted url()", () => {
    // Quadratic took about 30 s for this; linear well under a second, so the bound is generous.
    const css = `.a{background:url("#x")}`.repeat(40000);
    const start = performance.now();
    expect(blocked(css).css).toBe(css);
    expect(performance.now() - start).toBeLessThan(5000);
  });
});
