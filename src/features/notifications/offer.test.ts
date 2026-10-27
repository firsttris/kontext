import { describe, expect, it } from "vitest";
import {
  ASK_AGAIN_AFTER,
  lastOffer,
  offerCandidates,
  offerDue,
  parsePostponed,
  pickOffer,
} from "./offer";

describe("offerDue", () => {
  it("asks at first, once more a week after 'Später', then never", () => {
    expect(offerDue({ times: 0, at: 0 }, 1000)).toBe(true);
    expect(offerDue({ times: 1, at: 1000 }, 1000 + ASK_AGAIN_AFTER - 1)).toBe(false);
    expect(offerDue({ times: 1, at: 1000 }, 1000 + ASK_AGAIN_AFTER)).toBe(true);
    expect(offerDue({ times: 2, at: 1000 }, 1000 + 10 * ASK_AGAIN_AFTER)).toBe(false);
  });

  it("knows the second card is the last", () => {
    expect(lastOffer({ times: 0, at: 0 })).toBe(false);
    expect(lastOffer({ times: 1, at: 0 })).toBe(true);
  });
});

describe("parsePostponed", () => {
  it("falls back to never postponed", () => {
    expect(parsePostponed(null)).toEqual({ times: 0, at: 0 });
    expect(parsePostponed("kaputt")).toEqual({ times: 0, at: 0 });
    expect(parsePostponed('{"times":1,"at":5}')).toEqual({ times: 1, at: 5 });
  });
});

describe("offerCandidates", () => {
  const computer = {
    chosen: false,
    supported: true,
    installed: false,
    apple: false,
    promptOnPhone: false,
  };

  it("offers a computer the notifications only", () => {
    expect(offerCandidates(computer)).toEqual(["push"]);
    expect(offerCandidates({ ...computer, chosen: true })).toEqual([]);
  });

  it("asks a phone to install first, then offers the notifications", () => {
    expect(offerCandidates({ ...computer, promptOnPhone: true })).toEqual(["install", "push"]);
    expect(offerCandidates({ ...computer, promptOnPhone: true, installed: true })).toEqual([
      "push",
    ]);
  });

  it("asks Safari on iPhone and iPad to install, where it has no notifications", () => {
    expect(offerCandidates({ ...computer, apple: true, supported: false })).toEqual(["install"]);
    expect(offerCandidates({ ...computer, apple: true, installed: true })).toEqual(["push"]);
  });

  it("offers nothing where the browser can neither install nor notify", () => {
    expect(offerCandidates({ ...computer, supported: false })).toEqual([]);
  });
});

describe("pickOffer", () => {
  const fresh = { times: 0, at: 0 };

  it("shows one card at a time, the next once the first was postponed", () => {
    expect(pickOffer(["install", "push"], { install: fresh, push: fresh }, 1000)).toBe("install");
    const postponed = { times: 1, at: 1000 };
    expect(pickOffer(["install", "push"], { install: postponed, push: fresh }, 2000)).toBe("push");
    expect(
      pickOffer(["install", "push"], { install: postponed, push: postponed }, 2000),
    ).toBeNull();
  });
});
