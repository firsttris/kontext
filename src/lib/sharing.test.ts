import { describe, expect, it } from "vitest";
import {
  accessOf,
  everyoneAccess,
  nextShareWith,
  rightsFor,
  sharedWith,
  withEveryone,
} from "./sharing";

describe("sharing", () => {
  it("reads the access from address book and calendar rights", () => {
    expect(accessOf(undefined)).toBe("none");
    expect(accessOf({ mayRead: true })).toBe("read");
    expect(accessOf({ mayRead: true, mayWrite: true })).toBe("edit");
    expect(accessOf({ mayReadFreeBusy: true })).toBe("availability");
    expect(accessOf({ mayReadFreeBusy: false })).toBe("none");
    expect(accessOf({ mayReadFreeBusy: true, mayReadItems: true })).toBe("read");
    expect(accessOf({ mayReadItems: true, mayWriteAll: true })).toBe("edit");
  });
  it("lets address book editors remove entries but not share further", () => {
    expect(rightsFor("edit", "addressBook")).toEqual({
      mayRead: true,
      mayWrite: true,
      mayDelete: true,
      mayShare: false,
    });
    expect(rightsFor("none", "addressBook")).toBeNull();
  });
  it("lets calendar editors change all events but not delete the calendar", () => {
    expect(rightsFor("edit", "calendar")).toMatchObject({
      mayReadItems: true,
      mayWriteAll: true,
      mayRSVP: true,
      mayDelete: false,
      mayShare: false,
    });
    expect(rightsFor("read", "calendar")).toMatchObject({
      mayReadFreeBusy: true,
      mayReadItems: true,
      mayWriteAll: false,
    });
  });
  it("changes, adds and removes principals", () => {
    const current = { e: { mayRead: true }, f: { mayRead: true, mayWrite: true } };
    const next = nextShareWith(current, { e: "edit", f: "none", g: "read" }, "addressBook");
    expect(Object.keys(next).sort()).toEqual(["e", "g"]);
    expect(accessOf(next.e)).toBe("edit");
    expect(accessOf(next.g)).toBe("read");
    expect(current.f).toBeDefined();
  });
  it("shares a calendar's free and busy times only, not its events", () => {
    expect(rightsFor("availability", "calendar")).toMatchObject({
      mayReadFreeBusy: true,
      mayReadItems: false,
    });
    expect(rightsFor("availability", "addressBook")).toBeNull();
  });
  it("lists who can see it", () => {
    expect(sharedWith({ e: { mayRead: true }, f: { mayRead: false } })).toEqual(["e"]);
    expect(sharedWith({ e: { mayReadFreeBusy: true } })).toEqual([]);
    expect(sharedWith(null)).toEqual([]);
  });

  it("shows all colleagues the free and busy times, keeping more access where given", () => {
    const people = ["e", "f", "g"];
    const current = { e: { mayReadFreeBusy: true, mayReadItems: true } };
    expect(everyoneAccess(current, people)).toBe("none");
    const all = withEveryone(current, people, "availability");
    expect(everyoneAccess(all, people)).toBe("availability");
    expect(accessOf(all.e)).toBe("read");
    expect(accessOf(all.f)).toBe("availability");
    const back = withEveryone(all, people, "none");
    expect(Object.keys(back)).toEqual(["e"]);
    expect(everyoneAccess({}, [])).toBe("none");
  });
});
