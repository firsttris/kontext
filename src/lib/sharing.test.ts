import { describe, expect, it } from "vitest";
import { accessOf, nextShareWith, rightsFor, sharedWith } from "./sharing";

describe("sharing", () => {
  it("reads the access from rights", () => {
    expect(accessOf(undefined)).toBe("none");
    expect(accessOf({ mayRead: true })).toBe("read");
    expect(accessOf({ mayRead: true, mayWrite: true })).toBe("edit");
  });
  it("lets editors remove entries but not share further", () => {
    expect(rightsFor("edit")).toEqual({
      mayRead: true,
      mayWrite: true,
      mayDelete: true,
      mayShare: false,
    });
    expect(rightsFor("none")).toBeNull();
  });
  it("changes, adds and removes principals", () => {
    const current = { e: { mayRead: true }, f: { mayRead: true, mayWrite: true } };
    const next = nextShareWith(current, { e: "edit", f: "none", g: "read" });
    expect(Object.keys(next).sort()).toEqual(["e", "g"]);
    expect(accessOf(next.e)).toBe("edit");
    expect(accessOf(next.g)).toBe("read");
    expect(current.f).toBeDefined();
  });
  it("lists who can see it", () => {
    expect(sharedWith({ e: { mayRead: true }, f: { mayRead: false } })).toEqual(["e"]);
    expect(sharedWith(null)).toEqual([]);
  });
});
