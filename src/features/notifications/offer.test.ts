import { describe, expect, it } from "vitest";
import { ASK_AGAIN_AFTER, lastOffer, offerDue, offerKind, parsePostponed } from "./offer";

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

describe("offerKind", () => {
  const device = { chosen: false, supported: true, apple: false, installed: false };

  it("offers the switch where the browser can notify", () => {
    expect(offerKind(device)).toBe("push");
    expect(offerKind({ ...device, apple: true, installed: true })).toBe("push");
  });

  it("offers nothing once the switch was set on this device", () => {
    expect(offerKind({ ...device, chosen: true })).toBeNull();
  });

  it("asks iPhone and iPad to install first, other browsers without notifications get nothing", () => {
    expect(offerKind({ ...device, supported: false, apple: true })).toBe("install");
    expect(offerKind({ ...device, supported: false })).toBeNull();
  });
});
