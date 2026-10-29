import { describe, expect, it } from "vitest";
import type { PrintDay } from "./calendar-print";
import { type CalendarSheet, calendarPrintDocument } from "./calendar-print-document";

const day = (key: string, extra: Partial<PrintDay> = {}): PrintDay => ({
  day: key,
  inMonth: true,
  entries: [],
  more: 0,
  ...extra,
});

const week: CalendarSheet = {
  kind: "week",
  title: "26. Oktober – 1. November 2026",
  subtitle: "KW 44",
  heads: ["Montag, 26.10.", "Dienstag, 27.10."],
  weeks: [
    [
      day("2026-10-26", {
        entries: [
          {
            title: "Baubesprechung <Hoffmann>",
            time: "10:00–11:30",
            place: "Gartenweg 3",
            color: "#2563eb",
            allDay: false,
          },
          { title: "Messe", time: "", place: "", color: "#0f766e", allDay: true },
        ],
      }),
      day("2026-10-27"),
    ],
  ],
  calendars: [{ name: "Jonas & Team", color: "#2563eb" }],
  printed: "Gedruckt am 29.10.2026, 14:05",
};

describe("calendarPrintDocument", () => {
  it("prints the week on landscape A4: heads, times, titles and places, escaped", () => {
    const page = calendarPrintDocument(week);
    expect(page).toContain("@page { size: A4 landscape;");
    expect(page).toContain("<h1>26. Oktober – 1. November 2026</h1>");
    expect(page).toContain('<span class="sub">KW 44</span>');
    expect(page).toContain('<div class="date">Montag, 26.10.</div>');
    expect(page).toContain(
      '<span class="time">10:00–11:30</span> <span class="title">Baubesprechung &lt;Hoffmann&gt;</span><span class="place">Gartenweg 3</span>',
    );
    expect(page).toContain(
      '<li class="entry all-day" style="--cal:#0f766e"><span class="title">Messe</span>',
    );
    expect(page).toContain('style="--cal:#2563eb">Jonas &amp; Team</span>');
    expect(page).toContain("Gedruckt am 29.10.2026, 14:05");
  });

  it("fetches nothing from outside and checks the legend's colours", () => {
    const page = calendarPrintDocument({
      ...week,
      calendars: [{ name: "Fremd", color: "red;background:url(https://x.test/)" }],
    });
    expect(page).toContain("default-src 'none'");
    expect(page).not.toContain("x.test");
  });

  it("prints a month with weekday heads, other months' days greyed, the rest counted", () => {
    const page = calendarPrintDocument({
      ...week,
      kind: "month",
      title: "November 2026",
      subtitle: "",
      heads: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
      weeks: [[day("2026-10-26", { inMonth: false }), { ...week.weeks[0]![0]!, more: 3 }]],
    });
    expect(page).toContain('<div class="head">Mo</div>');
    expect(page).toContain(
      '<div class="day other" data-day="2026-10-26"><div class="date">26</div>',
    );
    expect(page).toContain('<li class="more">+3 weitere</li>');
    expect(page).not.toContain('class="sub"');
    // Places are left out in the month: a line has no room for them.
    expect(page).toContain(
      '<span class="time">10:00</span> <span class="title">Baubesprechung &lt;Hoffmann&gt;</span></li>',
    );
    expect(page).not.toContain("Gartenweg 3");
  });
});
