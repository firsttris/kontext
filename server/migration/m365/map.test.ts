import { describe, expect, it } from "vitest";
import { contactToCard, durationBetween, eventToJSCalendar, recurrenceToRule } from "./map";

describe("contactToCard", () => {
  it("takes name, company, addresses, phones and address", () => {
    expect(
      contactToCard({
        givenName: "Petra",
        surname: "Keller",
        companyName: "Keller Elektro",
        jobTitle: "Inhaberin",
        emailAddresses: [{ address: "p@keller.de", name: "Petra" }],
        businessPhones: ["07223 1234"],
        mobilePhone: "0171 1",
        businessAddress: { street: "Hauptstr. 1", postalCode: "77815", city: "Bühl" },
      }),
    ).toEqual({
      kind: "individual",
      name: {
        components: [
          { kind: "given", value: "Petra" },
          { kind: "surname", value: "Keller" },
        ],
        isOrdered: true,
      },
      emails: { e0: { address: "p@keller.de" } },
      phones: {
        p0: { number: "07223 1234", features: { voice: true }, contexts: { work: true } },
        p1: { number: "0171 1", features: { mobile: true } },
      },
      organizations: { o0: { name: "Keller Elektro" } },
      titles: { t0: { name: "Inhaberin" } },
      addresses: {
        a0: {
          components: [
            { kind: "name", value: "Hauptstr. 1" },
            { kind: "postcode", value: "77815" },
            { kind: "locality", value: "Bühl" },
          ],
          contexts: { work: true },
        },
      },
      notes: undefined,
    });
  });

  it("falls back to the display name", () => {
    expect(contactToCard({ displayName: "Lager" }).name).toEqual({ full: "Lager" });
  });
});

describe("events", () => {
  it("maps Outlook's series to recurrence rules", () => {
    expect(
      recurrenceToRule({
        pattern: { type: "weekly", interval: 2, daysOfWeek: ["monday", "thursday"] },
        range: { type: "endDate", startDate: "2026-11-02", endDate: "2027-03-31" },
      }),
    ).toEqual({
      "@type": "RecurrenceRule",
      frequency: "weekly",
      interval: 2,
      byDay: [{ day: "mo" }, { day: "th" }],
      until: "2027-03-31T23:59:59",
    });
    expect(
      recurrenceToRule({
        pattern: { type: "relativeMonthly", daysOfWeek: ["friday"], index: "last", interval: 1 },
        range: { type: "numbered", numberOfOccurrences: 6 },
      }),
    ).toEqual({
      "@type": "RecurrenceRule",
      frequency: "monthly",
      byDay: [{ day: "fr", nthOfPeriod: -1 }],
      count: 6,
    });
    expect(
      recurrenceToRule({
        pattern: { type: "absoluteYearly", dayOfMonth: 24, month: 12 },
        range: { type: "noEnd" },
      }),
    ).toEqual({
      "@type": "RecurrenceRule",
      frequency: "yearly",
      byMonthDay: [24],
      byMonth: ["12"],
    });
  });

  it("computes durations", () => {
    expect(
      durationBetween("2026-11-05T08:00:00.0000000", "2026-11-05T09:30:00.0000000", false),
    ).toBe("PT1H30M");
    expect(durationBetween("2026-11-05T00:00:00", "2026-11-07T00:00:00", true)).toBe("P2D");
    expect(durationBetween("2026-11-05T08:00:00", "2026-11-05T08:00:00", false)).toBe("PT0S");
  });

  it("turns an appointment into JSCalendar in German time", () => {
    expect(
      eventToJSCalendar(
        {
          subject: "Baustelle Hoffmann",
          body: { contentType: "html", content: "<p>Material&nbsp;mitnehmen</p>" },
          start: { dateTime: "2026-11-05T08:00:00.0000000" },
          end: { dateTime: "2026-11-05T10:00:00.0000000" },
          location: { displayName: "Bühl" },
          showAs: "busy",
        },
        "Europe/Berlin",
      ),
    ).toEqual({
      "@type": "Event",
      title: "Baustelle Hoffmann",
      description: "Material mitnehmen",
      start: "2026-11-05T08:00:00",
      timeZone: "Europe/Berlin",
      duration: "PT2H",
      locations: { l0: { "@type": "Location", name: "Bühl" } },
    });
    expect(
      eventToJSCalendar(
        {
          subject: "Urlaub",
          isAllDay: true,
          start: { dateTime: "2026-12-24T00:00:00.0000000" },
          end: { dateTime: "2026-12-27T00:00:00.0000000" },
        },
        "Europe/Berlin",
      ),
    ).toMatchObject({ start: "2026-12-24T00:00:00", showWithoutTime: true, duration: "P3D" });
  });
});
