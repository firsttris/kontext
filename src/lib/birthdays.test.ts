import { describe, expect, it } from "vitest";
import {
  birthDate,
  birthdayEvent,
  birthdayIn,
  birthdaysBetween,
  birthdayTitle,
  isBirthday,
} from "./birthdays";
import { eventTimes, onDay } from "./jscalendar";
import type { Anniversary, ContactCard } from "./jscontact";

const card = (
  id: string,
  given: string,
  surname: string,
  date?: Anniversary["date"],
  extra: Partial<ContactCard> = {},
): ContactCard & { accountId: string } => ({
  id,
  accountId: "a",
  addressBookIds: { b: true },
  name: {
    components: [
      { kind: "given", value: given },
      { kind: "surname", value: surname },
    ],
  },
  ...(date ? { anniversaries: { k: { "@type": "Anniversary", kind: "birth", date } } } : {}),
  ...extra,
});

describe("birthDate", () => {
  it("reads a partial date with and without its year", () => {
    expect(
      birthDate(card("1", "P", "K", { "@type": "PartialDate", year: 1974, month: 5, day: 4 })),
    ).toEqual({ year: 1974, month: 5, day: 4 });
    expect(birthDate(card("1", "P", "K", { month: 12, day: 24 }))).toEqual({ month: 12, day: 24 });
  });

  it("reads the UTC date of a timestamp", () => {
    expect(
      birthDate(card("1", "P", "K", { "@type": "Timestamp", utc: "1980-03-01T00:00:00Z" })),
    ).toEqual({ year: 1980, month: 3, day: 1 });
  });

  it("ignores other days, missing parts and days that do not exist", () => {
    expect(
      birthDate({ anniversaries: { w: { kind: "wedding", date: { month: 6, day: 1 } } } }),
    ).toBeUndefined();
    expect(birthDate(card("1", "P", "K", { year: 1980, month: 6 }))).toBeUndefined();
    expect(birthDate(card("1", "P", "K", { month: 4, day: 31 }))).toBeUndefined();
    expect(birthDate(card("1", "P", "K"))).toBeUndefined();
  });
});

describe("birthdayIn", () => {
  it("puts 29 February on the 28th in years without it", () => {
    expect(birthdayIn(2027, { month: 2, day: 29 })).toBe("2027-02-28");
    expect(birthdayIn(2028, { month: 2, day: 29 })).toBe("2028-02-29");
    expect(birthdayIn(2100, { month: 2, day: 29 })).toBe("2100-02-28");
    expect(birthdayIn(2000, { month: 2, day: 29 })).toBe("2000-02-29");
  });
});

describe("birthdaysBetween", () => {
  const petra = card("p", "Petra", "Keller", { year: 1974, month: 11, day: 3 });
  const claudia = card("c", "Claudia", "Sommer", { month: 11, day: 3 });
  const tom = card("t", "Thomas", "Lang", { month: 1, day: 2 });

  it("lists the birthdays in the range, with the age when the year is known", () => {
    expect(birthdaysBetween([petra, claudia, tom], "2026-10-26", "2026-12-06")).toEqual([
      { day: "2026-11-03", name: "Claudia Sommer", contact: { accountId: "a", id: "c" } },
      { day: "2026-11-03", name: "Petra Keller", age: 52, contact: { accountId: "a", id: "p" } },
    ]);
  });

  it("spans the turn of the year", () => {
    const days = birthdaysBetween([petra, tom], "2026-12-28", "2027-01-31").map((b) => b.day);
    expect(days).toEqual(["2027-01-02"]);
    expect(birthdaysBetween([tom, petra], "2026-01-01", "2027-12-31")).toHaveLength(4);
  });

  it("shows nothing before the year of birth and no age on the day of birth", () => {
    const baby = card("b", "Lena", "Neu", { year: 2026, month: 3, day: 1 });
    expect(birthdaysBetween([baby], "2025-01-01", "2025-12-31")).toEqual([]);
    expect(birthdaysBetween([baby], "2026-01-01", "2026-12-31")[0]?.age).toBeUndefined();
    expect(birthdaysBetween([baby], "2027-01-01", "2027-12-31")[0]?.age).toBe(1);
  });

  it("skips groups and shows a person in two address books once", () => {
    const group = card("g", "Team", "", { month: 11, day: 3 }, { kind: "group" });
    const copy = { ...petra, id: "p2", accountId: "info" };
    expect(birthdaysBetween([petra, copy, group], "2026-11-01", "2026-11-30")).toHaveLength(1);
  });

  it("shows a person once when the copies differ only in case and spaces", () => {
    const copy = { ...card("p2", "petra", " keller ", { month: 11, day: 3 }), accountId: "info" };
    const days = birthdaysBetween([petra, copy], "2026-11-01", "2026-11-30");
    expect(days).toHaveLength(1);
    expect(days[0]?.name).toBe("Petra Keller");
  });
});

describe("birthdayEvent", () => {
  it("is an all-day event of one day that leads to the contact", () => {
    const [birthday] = birthdaysBetween(
      [card("p", "Petra", "Keller", { year: 1974, month: 11, day: 3 })],
      "2026-11-01",
      "2026-11-30",
    );
    const event = birthdayEvent(birthday!, "#db2777");
    expect(event.title).toBe("Petra Keller (52)");
    expect(eventTimes(event).allDay).toBe(true);
    expect(onDay(event, "2026-11-03")).toBe(true);
    expect(onDay(event, "2026-11-04")).toBe(false);
    expect(isBirthday(event)).toBe(true);
    expect(event.contact).toEqual({ accountId: "a", id: "p" });
    expect(isBirthday({ id: "e", calendarIds: {}, start: "2026-11-03T09:00:00" })).toBe(false);
  });

  it("names only the person without a year", () => {
    expect(birthdayTitle({ name: "Claudia Sommer" })).toBe("Claudia Sommer");
  });
});
