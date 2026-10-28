import { describe, expect, it } from "vitest";
import type { Scene, Step, Take } from "../types";
import {
  cameraAt,
  cameraFor,
  ENTER,
  EXIT,
  FADE,
  noteAt,
  pointerAt,
  schedule,
  shownOn,
  slotAt,
  timeSteps,
  WIDE,
} from "./timeline";

const step = (shot: string, seconds: number, extra: Partial<Step> = {}): Step => ({
  screen: "app",
  shot,
  seconds,
  ...extra,
});

const take: Take = {
  name: "mail",
  screens: [{ id: "app", kind: "desktop", width: 1440, height: 900, label: "" }],
  steps: [
    step("0.jpg", 1, { note: "Posteingang" }),
    step("1.jpg", 2, { pointer: { x: 100, y: 100 }, note: "Posteingang" }),
    step("2.jpg", 1, { focus: { x: 0, y: 0, width: 300, height: 200 } }),
  ],
};

/** On the stage the screen sits at its own pixels. */
const at = (s: Step) => s.pointer;
const steps = timeSteps(take, at);

describe("schedule", () => {
  it("puts the scenes one after the other, a take as long as its steps and its way in and out", () => {
    const scenes: Scene[] = [
      { kind: "title", lines: ["Hallo"], seconds: 3 },
      { kind: "take", take: "mail", layout: "window", kicker: "Mail", title: "Mail" },
    ];
    const slots = schedule(scenes, new Map([["mail", take]]));
    expect(slots.map((slot) => [slot.start, slot.end])).toEqual([
      [0, 3],
      [3, 3 + ENTER + 4 + EXIT],
    ]);
    expect(slotAt(slots, 2.9).scene.kind).toBe("title");
    expect(slotAt(slots, 3).scene.kind).toBe("take");
    // Past the end the last scene stays.
    expect(slotAt(slots, 99).scene.kind).toBe("take");
  });

  it("names a take that was not recorded", () => {
    const scenes: Scene[] = [
      { kind: "take", take: "chat", layout: "window", kicker: "Chat", title: "Chat" },
    ];
    expect(() => schedule(scenes, new Map())).toThrow(/No take "chat"/);
  });
});

describe("steps", () => {
  it("change their still at once, or after the pointer's way and the click", () => {
    expect(steps[0]!.change).toBe(ENTER);
    expect(steps[1]!.start).toBe(ENTER + 1);
    expect(steps[1]!.change).toBeGreaterThan(steps[1]!.start + 0.4);
    expect(steps[1]!.change).toBeLessThan(steps[1]!.end);
  });

  it("fade the new still over the old one", () => {
    const change = steps[1]!.change;
    expect(shownOn(steps, "app", change - 0.01)).toMatchObject({ shot: "0.jpg", progress: 1 });
    const fading = shownOn(steps, "app", change + FADE / 2)!;
    expect(fading).toMatchObject({ shot: "1.jpg", previous: "0.jpg" });
    expect(fading.progress).toBeCloseTo(0.5);
    expect(shownOn(steps, "app", change + FADE)).toEqual({
      shot: "1.jpg",
      previous: undefined,
      progress: 1,
      wipe: false,
    });
  });

  it("move the pointer to the click and press it there", () => {
    const click = steps[1]!;
    expect(pointerAt(steps, click.start - 0.01, at)).toBeUndefined();
    const pressed = pointerAt(steps, click.change - 0.06, at)!;
    expect(pressed.at).toEqual({ x: 100, y: 100 });
    expect(pressed.press).toBeCloseTo(1);
    expect(pointerAt(steps, click.end, at)).toMatchObject({ at: { x: 100, y: 100 }, press: 0 });
  });
});

describe("camera", () => {
  it("comes close to a small rect, but never further than 1.9 times", () => {
    expect(cameraFor(null)).toEqual(WIDE);
    expect(cameraFor({ x: 0, y: 0, width: 100, height: 100 })).toEqual({ x: 50, y: 50, zoom: 1.9 });
    expect(cameraFor({ x: 0, y: 0, width: 1920, height: 1080 }).zoom).toBe(1);
  });

  it("moves to a focus when the still changes and back before the scene ends", () => {
    const rect = (s: Step) => s.focus ?? null;
    const focused = steps[2]!;
    expect(cameraAt(steps, focused.change - 0.01, rect)).toEqual(WIDE);
    expect(cameraAt(steps, focused.change + 0.9, rect).zoom).toBeGreaterThan(1.8);
    expect(cameraAt(steps, focused.end + 0.6, rect).zoom).toBeCloseTo(1);
  });
});

describe("notes", () => {
  it("stay on over the steps that share them, fading in and out at the ends", () => {
    expect(noteAt(steps, ENTER + 0.15)!.opacity).toBeCloseTo(0.5);
    expect(noteAt(steps, ENTER + 1.5)).toEqual({ text: "Posteingang", opacity: 1 });
    expect(noteAt(steps, steps[1]!.end - 0.15)!.opacity).toBeCloseTo(0.5);
    expect(noteAt(steps, steps[2]!.start + 0.1)).toBeUndefined();
  });
});
