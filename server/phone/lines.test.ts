import { describe, expect, it } from "vitest";
import { deskForBox, everyone, lineOf, outLineOf, ringPlanFor } from "./lines";
import type { PhoneSettings } from "./store";

const settings = {
  line: { registrar: "fritz.box", username: "k620", password: "p" },
  ring: ["jonas", "anna"],
  ringMode: "order",
  ringStepSeconds: 15,
  extraLines: [
    { id: "a1", label: "Durchwahl Max", username: "k621", password: "p", ring: ["max"] },
  ],
  deskPhones: [],
} as unknown as PhoneSettings;

describe("lines", () => {
  it("knows a call's line, its people and who calls out with which", () => {
    expect(lineOf(settings, "k621")?.label).toBe("Durchwahl Max");
    expect(lineOf(settings, "k620")).toBeNull();
    expect(ringPlanFor(settings, null)).toEqual({
      mode: "order",
      stepSeconds: 15,
      order: ["jonas", "anna"],
    });
    expect(ringPlanFor(settings, lineOf(settings, "k621"))).toMatchObject({
      mode: "all",
      order: ["max"],
    });
    expect(everyone(settings)).toEqual(["jonas", "anna", "max"]);
    expect(outLineOf(settings, "max")?.id).toBe("a1");
    expect(outLineOf(settings, "jonas")).toBeNull();
  });

  it("rings a desk phone for its person's lines, a shared one for the first", () => {
    const desk = {
      id: "d1",
      label: "Max",
      mac: "000413a1b2c3",
      extension: "21",
      password: "p",
      member: "max",
    };
    expect(deskForBox(settings, desk)).toMatchObject({ lines: ["k621"], outLine: "a1" });
    expect(deskForBox(settings, { ...desk, member: "jonas" })).toMatchObject({
      lines: ["k620"],
      outLine: null,
    });
    expect(deskForBox(settings, { ...desk, member: null })).toMatchObject({ lines: ["k620"] });
  });
});
