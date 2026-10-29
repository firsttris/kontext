import { describe, expect, it } from "vitest";
import { reminderNotice } from "./reminders";

describe("reminderNotice", () => {
  const alert = { accountId: "d", calendarEventId: "i", recurrenceId: null, alertId: "a1" };

  it("names the appointment, its time and place, and links to it", () => {
    expect(
      reminderNotice(alert, {
        title: "Baubesprechung Hoffmann",
        start: "2026-10-29T14:00:00",
        timeZone: "Europe/Berlin",
        locations: { l: { name: "Baustelle Kirchstraße" } },
      }),
    ).toEqual({
      title: "Erinnerung: Baubesprechung Hoffmann",
      body: "Do., 29.10., 14:00 · Baustelle Kirchstraße",
      url: "/calendar?date=2026-10-29&event=i&account=d",
      tag: "reminder-d/i",
    });
  });

  it("takes the date of a series from the recurrence id", () => {
    const notice = reminderNotice(
      { ...alert, recurrenceId: "2026-11-09T10:00:00" },
      { title: "Teambesprechung", start: "2026-11-02T10:00:00", timeZone: "Europe/Berlin" },
    );
    expect(notice.body).toBe("Mo., 09.11., 10:00");
    expect(notice.url).toBe("/calendar?date=2026-11-09&event=i&account=d");
    expect(notice.tag).toBe("reminder-d/i/2026-11-09T10:00:00");
  });

  it("leaves out the time of an all-day appointment", () => {
    const notice = reminderNotice(alert, {
      title: "",
      start: "2026-12-24T00:00:00",
      timeZone: null,
      showWithoutTime: true,
    });
    expect(notice.title).toBe("Erinnerung: Termin");
    expect(notice.body).toBe("Do., 24.12.");
    expect(notice.url).toBe("/calendar?date=2026-12-24&event=i&account=d");
  });
});
