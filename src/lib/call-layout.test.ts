import { describe, expect, it } from "vitest";
import { arrangeTiles, gridColumns } from "./call-layout";

type Tile = { id: string; local?: boolean; screen?: boolean };
const by = {
  isScreen: (tile: Tile) => Boolean(tile.screen),
  isLocal: (tile: Tile) => Boolean(tile.local),
};
const me: Tile = { id: "me", local: true };
const anna: Tile = { id: "anna" };
const max: Tile = { id: "max" };

describe("arrangeTiles", () => {
  it("puts the other one of two on the stage, one's own camera as an inset", () => {
    expect(arrangeTiles([me, anna], by)).toEqual({
      kind: "stage",
      main: anna,
      inset: me,
      strip: [],
    });
  });

  it("shows one alone, and three or more, as a grid", () => {
    expect(arrangeTiles([me], by)).toEqual({ kind: "grid", tiles: [me] });
    expect(arrangeTiles([me, anna, max], by)).toEqual({ kind: "grid", tiles: [me, anna, max] });
  });

  it("gives a shared screen the stage and everyone else the strip", () => {
    const screen: Tile = { id: "anna-screen", screen: true };
    expect(arrangeTiles([me, anna, screen], by)).toEqual({
      kind: "stage",
      main: screen,
      inset: null,
      strip: [me, anna],
    });
  });
});

describe("gridColumns", () => {
  it("stacks on a phone held upright", () => {
    expect(gridColumns(3, 360, 560)).toBe(1);
    expect(gridColumns(2, 360, 560)).toBe(1);
  });

  it("goes side by side where there is width", () => {
    expect(gridColumns(2, 1200, 600)).toBe(2);
    expect(gridColumns(3, 376, 270)).toBe(2);
    expect(gridColumns(9, 1200, 700)).toBe(3);
  });

  it("is one column for one picture or no space yet", () => {
    expect(gridColumns(1, 1200, 600)).toBe(1);
    expect(gridColumns(4, 0, 0)).toBe(1);
  });
});
