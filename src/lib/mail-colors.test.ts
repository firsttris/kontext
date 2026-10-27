import { describe, expect, it } from "vitest";
import { darkBackgroundColor, darkStylesheet, darkTextColor, parseColor } from "./mail-colors";

describe("parseColor", () => {
  it("reads hex, rgb() and the names mails use", () => {
    expect(parseColor("#1F497D")).toEqual({ r: 31, g: 73, b: 125 });
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("FFFFFF")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("rgb(0, 0, 0)")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseColor("rgb(100% 0% 0% / 1)")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor("windowtext")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("leaves out what it cannot read and what is mostly transparent", () => {
    expect(parseColor("inherit")).toBeNull();
    expect(parseColor("currentcolor")).toBeNull();
    expect(parseColor("rgba(255, 255, 255, 0.1)")).toBeNull();
    expect(parseColor("#ffffff10")).toBeNull();
  });
});

describe("darkTextColor", () => {
  it("turns dark text light and keeps its hue", () => {
    expect(darkTextColor("black")).toBe("rgb(255, 255, 255)");
    const blue = parseColor(darkTextColor("#1F497D")!)!;
    expect(blue.b).toBeGreaterThan(blue.r);
    expect(blue.r).toBeGreaterThan(120);
  });

  it("lightens pure blue until it can be read", () => {
    const blue = parseColor(darkTextColor("#0000ff")!)!;
    expect(blue.r).toBeGreaterThan(80);
    expect(blue.b).toBe(255);
  });

  it("keeps text that is light enough", () => {
    expect(darkTextColor("#ffffff")).toBeNull();
    expect(darkTextColor("#60a5fa")).toBeNull();
    expect(darkTextColor("inherit")).toBeNull();
  });
});

describe("darkBackgroundColor", () => {
  it("turns light paper dark", () => {
    expect(darkBackgroundColor("white")).toBe("rgb(0, 0, 0)");
    expect(darkBackgroundColor("#f4f4f5")).toBe("rgb(10, 10, 11)");
  });

  it("turns saturated paper dark too: Outlook's highlight colours", () => {
    for (const highlight of ["yellow", "lime", "cyan", "magenta"]) {
      const turned = parseColor(darkBackgroundColor(highlight)!)!;
      expect(Math.max(turned.r, turned.g, turned.b)).toBeLessThan(80);
    }
  });

  it("keeps dark and middle colours, as a blue button", () => {
    expect(darkBackgroundColor("#2563eb")).toBeNull();
    expect(darkBackgroundColor("#000000")).toBeNull();
  });
});

describe("darkStylesheet", () => {
  it("turns lone colours in declarations and keeps the rest", () => {
    expect(
      darkStylesheet(
        ".card { background: #ffffff; color:#000 !important; border-color: black }\n" +
          "a { background-color: white; background: url(x.png) white }",
      ),
    ).toBe(
      ".card { background: rgb(0, 0, 0); color:rgb(255, 255, 255) !important; border-color: black }\n" +
        "a { background-color: rgb(0, 0, 0); background: url(x.png) white }",
    );
  });

  it("leaves selectors alone", () => {
    expect(darkStylesheet(".color:hover { text-decoration: underline }")).toBe(
      ".color:hover { text-decoration: underline }",
    );
  });
});
