import { describe, expect, it } from "vitest";
import { comingHolidays, easterSunday, holidays, STATES, type State } from "./holidays";

const names = (year: number, state: State) => holidays(year, state).map((h) => h.name);

describe("public holidays", () => {
  it("finds Easter", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2000)).toBe("2000-04-23");
  });

  it("has Baden-Württemberg's twelve days, the movable ones from Easter", () => {
    const days = holidays(2026, "BW");
    expect(days).toHaveLength(12);
    expect(days).toContainEqual({ day: "2026-04-03", name: "Karfreitag" });
    expect(days).toContainEqual({ day: "2026-05-14", name: "Christi Himmelfahrt" });
    expect(days).toContainEqual({ day: "2026-05-25", name: "Pfingstmontag" });
    expect(days).toContainEqual({ day: "2026-06-04", name: "Fronleichnam" });
  });

  it("gives every state the nine nationwide days", () => {
    for (const state of Object.keys(STATES) as State[]) {
      expect(names(2026, state)).toEqual(
        expect.arrayContaining(["Neujahr", "Karfreitag", "Tag der Deutschen Einheit"]),
      );
      expect(holidays(2026, state).length).toBeGreaterThanOrEqual(10);
    }
  });

  it("adds each state's own days", () => {
    expect(names(2026, "BE")).toContain("Internationaler Frauentag");
    expect(names(2026, "BB")).toEqual(expect.arrayContaining(["Ostersonntag", "Pfingstsonntag"]));
    expect(names(2026, "SL")).toContain("Mariä Himmelfahrt");
    expect(names(2026, "TH")).toEqual(expect.arrayContaining(["Weltkindertag", "Reformationstag"]));
    expect(names(2026, "HH")).toContain("Reformationstag");
    expect(names(2026, "HH")).not.toContain("Fronleichnam");
    expect(holidays(2026, "HH")).toHaveLength(10);
  });

  it("keeps Easter and Whit Sunday in Hesse, as § 1 HFeiertagsG names them", () => {
    expect(names(2026, "HE")).toEqual(expect.arrayContaining(["Ostersonntag", "Pfingstsonntag"]));
  });

  it("puts Buß- und Bettag on the Wednesday before 23 November", () => {
    const day = (year: number) =>
      holidays(year, "SN").find((h) => h.name === "Buß- und Bettag")?.day;
    expect(day(2026)).toBe("2026-11-18");
    expect(day(2027)).toBe("2027-11-17");
    expect(day(2028)).toBe("2028-11-22");
  });

  it("lists the coming year from today", () => {
    const coming = comingHolidays("2026-10-25");
    expect(coming[0]).toEqual({ day: "2026-11-01", name: "Allerheiligen" });
    expect(coming.at(-1)).toEqual({ day: "2027-10-03", name: "Tag der Deutschen Einheit" });
  });
});
