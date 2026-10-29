/**
 * The calendar as a page to print: a week as seven columns or a month as its grid, on landscape
 * A4, light, without the app around it, e.g. for the pin board in the workshop. Titles and
 * places come from others (invitations, shared calendars): everything is escaped, colours are
 * checked (calendar-print.ts), and the page's CSP loads nothing. Pure.
 */
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { type PrintDay, type PrintEntry, safeColor } from "./calendar-print";
import { escapeHtml } from "./html";
import { printPolicy } from "./print";

export type CalendarSheet = {
  kind: "week" | "month";
  /** "Oktober 2026", "26. Oktober – 1. November 2026". */
  title: string;
  /** "KW 44"; empty for a month. */
  subtitle: string;
  /** The column heads: weekdays, for a week with their dates. */
  heads: string[];
  /** One row for a week, four to six for a month. */
  weeks: PrintDay[][];
  /** The calendars printed, so the colours can be told apart. */
  calendars: { name: string; color: string }[];
  /** "Gedruckt am 29.10.2026, 14:05": a sheet on the wall says how old it is. */
  printed: string;
};

/** A month's line has room for the start only ("10:00"), or the end of what began before. */
const shortTime = (time: string) => (time.startsWith("–") ? time : time.split("–")[0]!);

const entry = (item: PrintEntry, kind: CalendarSheet["kind"]) => {
  const week = kind === "week";
  const shown = week ? item.time : shortTime(item.time);
  const time = shown ? `<span class="time">${escapeHtml(shown)}</span> ` : "";
  const place = week && item.place ? `<span class="place">${escapeHtml(item.place)}</span>` : "";
  return `<li class="${item.allDay ? "entry all-day" : "entry"}" style="--cal:${item.color}">${time}<span class="title">${escapeHtml(item.title)}</span>${place}</li>`;
};

const cell = (day: PrintDay, kind: CalendarSheet["kind"], head?: string) => {
  const label = head ?? String(Number(day.day.slice(8)));
  const more = day.more
    ? `<li class="more">${escapeHtml(m.calendar_more({ count: day.more }))}</li>`
    : "";
  return `<div class="${day.inMonth ? "day" : "day other"}" data-day="${day.day}"><div class="date">${escapeHtml(label)}</div><ul>${day.entries.map((item) => entry(item, kind)).join("")}${more}</ul></div>`;
};

const grid = (sheet: CalendarSheet) => {
  // A week names each day in its column; a month has the weekdays as a row above the grid.
  const heads =
    sheet.kind === "month"
      ? sheet.heads.map((head) => `<div class="head">${escapeHtml(head)}</div>`).join("")
      : "";
  const days = sheet.weeks
    .flat()
    .map((day, index) =>
      cell(day, sheet.kind, sheet.kind === "week" ? sheet.heads[index] : undefined),
    )
    .join("");
  return `<main class="grid ${sheet.kind}" style="--weeks:${sheet.weeks.length}">${heads}${days}</main>`;
};

const legend = (calendars: CalendarSheet["calendars"]) =>
  calendars
    .map(
      (calendar) =>
        `<span class="calendar" style="--cal:${safeColor(calendar.color)}">${escapeHtml(calendar.name)}</span>`,
    )
    .join("");

const STYLE = `
  @page { size: A4 landscape; margin: 10mm; }
  html { color-scheme: light; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  body { margin: 0; font: 8.5pt/1.35 "Geist Variable", system-ui, sans-serif; color: #09090b; }
  .sheet { display: flex; flex-direction: column; min-height: 185mm; }
  header { display: flex; align-items: baseline; gap: 8pt; margin-bottom: 6pt; }
  h1 { margin: 0; font-size: 15pt; line-height: 1.2; }
  .sub { color: #71717a; font-size: 10pt; }
  .calendars { margin-left: auto; display: flex; flex-wrap: wrap; gap: 4pt 10pt; color: #52525b; }
  .calendar::before { content: ""; display: inline-block; width: 7pt; height: 7pt; margin-right: 3pt; border-radius: 2pt; background: var(--cal); }
  .grid { flex: 1; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border-top: 1px solid #d4d4d8; border-left: 1px solid #d4d4d8; }
  .grid.month { grid-template-rows: auto repeat(var(--weeks), minmax(0, 1fr)); height: 170mm; flex: none; }
  .head { padding: 2pt 4pt; font-weight: 500; color: #71717a; border-right: 1px solid #d4d4d8; border-bottom: 1px solid #d4d4d8; }
  .day { min-width: 0; overflow: hidden; padding: 3pt; border-right: 1px solid #d4d4d8; border-bottom: 1px solid #d4d4d8; }
  .day.other { background: #f4f4f5; color: #a1a1aa; }
  .date { font-weight: 600; margin-bottom: 2pt; }
  .week .date { font-size: 10pt; padding-bottom: 2pt; border-bottom: 1px solid #e4e4e7; margin-bottom: 4pt; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2pt; }
  .entry { border-left: 2.5pt solid var(--cal); padding: 1pt 3pt; break-inside: avoid; overflow-wrap: anywhere; }
  .entry.all-day { background: color-mix(in srgb, var(--cal) 14%, white); font-weight: 500; }
  .time { font-variant-numeric: tabular-nums; color: #52525b; }
  .place { display: block; color: #71717a; }
  .month ul { gap: 1pt; }
  .month .entry { padding: 0.5pt 3pt; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .more { color: #71717a; padding-left: 3pt; }
  footer { margin-top: 4pt; color: #a1a1aa; font-size: 7.5pt; text-align: right; }
`;

export const calendarPrintDocument = (sheet: CalendarSheet): string => `<!doctype html>
<html lang="${getLocale()}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${printPolicy(false)}"><title>${escapeHtml(sheet.title)}</title>
<style>${STYLE}</style></head><body><div class="sheet">
<header><h1>${escapeHtml(sheet.title)}</h1>${sheet.subtitle ? `<span class="sub">${escapeHtml(sheet.subtitle)}</span>` : ""}<div class="calendars">${legend(sheet.calendars)}</div></header>
${grid(sheet)}
<footer>${escapeHtml(sheet.printed)}</footer>
</div></body></html>`;
