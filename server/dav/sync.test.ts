// @vitest-environment node
import { describe, expect, it } from "vitest";
import { changesSince, createSnapshots, ctagOf, syncToken, tokenIn, wantsData } from "./sync";

describe("sync-collection", () => {
  it("turns a ctag into a token and back, and knows no one else's", () => {
    expect(ctagOf(syncToken("abc"))).toBe("abc");
    expect(ctagOf("http://sabre.io/ns/sync/3")).toBeNull();
    expect(ctagOf("urn:kontext:sync:")).toBeNull();
  });

  it("reads the token and whether the content is wanted from the REPORT", () => {
    const body = `<D:sync-collection xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
      <D:sync-token>urn:kontext:sync:abc</D:sync-token><D:sync-level>1</D:sync-level>
      <D:prop><D:getetag/><C:calendar-data/></D:prop></D:sync-collection>`;
    expect(tokenIn(body)).toBe("urn:kontext:sync:abc");
    expect(wantsData(body)).toBe(true);
    expect(tokenIn("<sync-collection xmlns='DAV:'><sync-token/></sync-collection>")).toBe("");
    expect(wantsData("<D:prop><D:getetag/></D:prop>")).toBe(false);
  });

  it("finds new, changed and gone tasks", () => {
    const before = new Map([
      ["a", '"1"'],
      ["b", '"1"'],
      ["c", '"1"'],
    ]);
    const now = new Map([
      ["a", '"1"'],
      ["b", '"2"'],
      ["d", '"1"'],
    ]);
    expect(changesSince(before, now)).toEqual({ changed: ["b", "d"], removed: ["c"] });
    expect(changesSince(new Map(), now).changed).toEqual(["a", "b", "d"]);
  });

  it("remembers the last tokens per board, the newest longest", () => {
    const snapshots = createSnapshots(2);
    const state = new Map([["a", '"1"']]);
    snapshots.remember("info", "t1", state);
    snapshots.remember("info", "t2", state);
    snapshots.remember("info", "t1", state);
    snapshots.remember("info", "t3", state);
    expect(snapshots.recall("info", "t1")).toBe(state);
    expect(snapshots.recall("info", "t2")).toBeNull();
    expect(snapshots.recall("info", "t3")).toBe(state);
    expect(snapshots.recall("jonas", "t3")).toBeNull();
  });
});
