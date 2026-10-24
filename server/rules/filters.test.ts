import { describe, expect, it } from "vitest";
import { readFilters, saveCalls, type Vacation } from "./filters";
import { type Rule, rulesScript } from "./script";

const vacation = (isEnabled: boolean): Vacation => ({
  isEnabled,
  fromDate: null,
  toDate: null,
  subject: "Urlaub",
  textBody: "Bin weg.",
  htmlBody: null,
});

const rule: Rule = {
  id: "r1",
  name: "",
  enabled: true,
  match: "all",
  conditions: [{ field: "from", operator: "contains", value: "kraus" }],
  moveTo: { id: "m", path: "Steuerberater" },
  markRead: false,
  flag: false,
  forwardTo: null,
  stop: false,
};

const script = (isActive: boolean) => ({
  id: "s1",
  name: "sekretaer-regeln",
  isActive,
  blobId: "b",
});

describe("readFilters", () => {
  it("takes the reply's state from VacationResponse without rules", () => {
    expect(readFilters(vacation(true), undefined, null)).toEqual({
      rules: [],
      vacation: vacation(true),
    });
  });

  it("takes it from the rules script while that runs", () => {
    const content = rulesScript({ vacation: true, rules: [rule] });
    expect(readFilters(vacation(false), script(true), content).vacation.isEnabled).toBe(true);
    // An inactive script (e.g. after offboarding) does not switch the reply on.
    expect(readFilters(vacation(false), script(false), content).vacation.isEnabled).toBe(false);
    expect(readFilters(vacation(false), script(true), content).rules).toEqual([rule]);
  });
});

const methods = (calls: ReturnType<typeof saveCalls>) => calls.map(([name, args]) => [name, args]);

describe("saveCalls", () => {
  it("only sets VacationResponse when there are no rules and never were", () => {
    expect(
      methods(saveCalls("a", { rules: [], vacation: vacation(true) }, undefined, null)),
    ).toEqual([
      ["VacationResponse/set", { accountId: "a", update: { singleton: vacation(true) } }],
    ]);
  });

  it("keeps VacationResponse off and activates the rules script, which includes the reply", () => {
    const [reply, rules] = saveCalls(
      "a",
      { rules: [rule], vacation: vacation(true) },
      undefined,
      "blob",
    );
    expect(reply![1]).toEqual({ accountId: "a", update: { singleton: vacation(false) } });
    expect(rules).toEqual([
      "SieveScript/set",
      {
        accountId: "a",
        create: { rules: { name: "sekretaer-regeln", blobId: "blob" } },
        onSuccessActivateScript: "#rules",
      },
      "rules",
    ]);
  });

  it("hands back to VacationResponse when the last rule goes and the reply is on", () => {
    const [reply, rules] = saveCalls(
      "a",
      { rules: [], vacation: vacation(true) },
      script(true),
      "blob",
    );
    expect(reply![1]).toEqual({ accountId: "a", update: { singleton: vacation(true) } });
    expect(rules![1]).toEqual({ accountId: "a", update: { s1: { blobId: "blob" } } });
  });

  it("leaves an offboarding script running: nothing activated, the reply stays off", () => {
    const [reply, rules] = saveCalls(
      "a",
      { rules: [rule], vacation: vacation(true) },
      script(false),
      "blob",
      true,
    );
    expect(reply![1]).toEqual({ accountId: "a", update: { singleton: vacation(false) } });
    expect(rules![1]).toEqual({ accountId: "a", update: { s1: { blobId: "blob" } } });
  });

  it("deactivates the rules script when nothing is left to run", () => {
    const [, rules] = saveCalls(
      "a",
      { rules: [{ ...rule, enabled: false }], vacation: vacation(false) },
      script(true),
      "blob",
    );
    expect(rules![1]).toEqual({
      accountId: "a",
      update: { s1: { blobId: "blob" } },
      onSuccessDeactivateScript: true,
    });
  });
});
