import { describe, expect, it } from "vitest";
import {
  cardPosition,
  isLastStep,
  MORE_TARGET,
  tourBack,
  tourNext,
  tourStart,
  tourSteps,
} from "./tour";

describe("tourSteps", () => {
  it("points at the rail on a desktop, with the shared mailbox for whoever has one", () => {
    const steps = tourSteps("desktop", { shared: true });
    expect(steps.map((step) => step.id)).toEqual([
      "welcome",
      "mail",
      "compose",
      "shared",
      "calendar",
      "chat",
    ]);
    expect(steps.find((step) => step.id === "chat")?.targets).toEqual(["app:/chat"]);
    expect(steps[0]?.targets).toEqual([]);
  });

  it("leaves the shared mailbox out without one", () => {
    expect(tourSteps("desktop", { shared: false }).map((step) => step.id)).not.toContain("shared");
  });

  it("falls back to „Mehr“ on a phone, where an app may not be in the tab bar", () => {
    const steps = tourSteps("phone", { shared: true });
    expect(steps.find((step) => step.id === "chat")?.targets).toEqual(["app:/chat", MORE_TARGET]);
    expect(steps.find((step) => step.id === "compose")?.targets).toEqual(["compose"]);
  });
});

describe("stepping through", () => {
  it("goes forward to the end, then is done", () => {
    let state = tourStart(3);
    expect(isLastStep(state)).toBe(false);
    state = tourNext(state)!;
    state = tourNext(state)!;
    expect(state.step).toBe(2);
    expect(isLastStep(state)).toBe(true);
    expect(tourNext(state)).toBeNull();
  });

  it("goes back, but not before the first step", () => {
    expect(tourBack({ step: 2, count: 3 })).toEqual({ step: 1, count: 3 });
    expect(tourBack(tourStart(3))).toEqual({ step: 0, count: 3 });
  });
});

describe("cardPosition", () => {
  const viewport = { width: 1440, height: 900 };
  const card = { width: 320, height: 180 };

  it("is in the middle without a target", () => {
    expect(cardPosition(null, viewport, card)).toBeNull();
  });

  it("goes right of a rail item, level with it", () => {
    expect(cardPosition({ top: 100, left: 10, width: 40, height: 40 }, viewport, card)).toEqual({
      top: 100,
      left: 62,
    });
  });

  it("stays on the screen at the bottom of the rail", () => {
    expect(cardPosition({ top: 850, left: 10, width: 40, height: 40 }, viewport, card)?.top).toBe(
      900 - 180 - 8,
    );
  });

  it("goes above a tab of a phone's tab bar", () => {
    const phone = { width: 390, height: 844 };
    expect(
      cardPosition({ top: 790, left: 100, width: 64, height: 44 }, phone, { ...card, height: 200 }),
    ).toEqual({ top: 790 - 12 - 200, left: 62 });
  });

  it("goes below a button at the top on a phone", () => {
    const phone = { width: 390, height: 844 };
    expect(cardPosition({ top: 12, left: 340, width: 32, height: 32 }, phone, card)).toEqual({
      top: 56,
      left: 62,
    });
  });

  it("is in the middle when it fits nowhere", () => {
    expect(
      cardPosition({ top: 0, left: 0, width: 300, height: 300 }, { width: 320, height: 320 }, card),
    ).toBeNull();
  });
});
