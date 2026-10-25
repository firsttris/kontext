/**
 * Tasks as iCalendar VTODO (RFC 5545) for CalDAV clients – Thunderbird, DAVx⁵ with tasks.org or
 * jtx Board, Apple Erinnerungen – and back. Times go out in UTC; times without a zone that come
 * in are taken as Berlin time. What a task has and VTODO has not (its checklist, links, column
 * beyond open / in progress / done) stays in Kontext. Pure.
 */
import { berlinInstant, type Repeat, type Task } from "../tasks/tasks";

export type Prop = { name: string; params: Record<string, string>; value: string };

/** Lines unfolded (RFC 5545 §3.1), each split into name, parameters and value. */
export const parseLines = (text: string): Prop[] =>
  text
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      // The value begins after the first colon outside of quotes.
      let quoted = false;
      let colon = -1;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') quoted = !quoted;
        else if (line[i] === ":" && !quoted) {
          colon = i;
          break;
        }
      }
      const head = colon < 0 ? line : line.slice(0, colon);
      const [name = "", ...rest] = head.split(";");
      const params = Object.fromEntries(
        rest.map((param) => {
          const [key = "", ...value] = param.split("=");
          return [key.toUpperCase(), value.join("=").replace(/^"|"$/g, "")];
        }),
      );
      return { name: name.toUpperCase(), params, value: colon < 0 ? "" : line.slice(colon + 1) };
    });

/** A TEXT value as written: "\n" a line break, "\;" "\," "\\" the characters themselves. */
const readText = (value: string) =>
  value.replace(/\\([\\;,nN])/g, (_, char: string) => (char.toLowerCase() === "n" ? "\n" : char));

const writeText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets folded (RFC 5545 §3.1), not inside a character. */
const fold = (line: string): string => {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    if (bytes.encode(current + char).length > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
    }
    current += char;
  }
  return [...parts, current].join("\r\n ");
};

const utc = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

const berlinParts = (date: Date) => {
  const local = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  const [day = "", time = ""] = local.split(" ");
  return { day, time };
};

/** An iCalendar date or date-time as a day, and a time if it has one, in Berlin. */
export const readDate = (prop: Prop): { day: string; time: string | null; at: Date } | null => {
  const match = prop.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z?))?$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, , z] = match;
  const day = `${y}-${mo}-${d}`;
  if (prop.params.VALUE === "DATE" || h === undefined) {
    return { day, time: null, at: berlinInstant(day, "08:00") };
  }
  const at = z
    ? new Date(Date.UTC(+y!, +mo! - 1, +d!, +h, +mi!))
    : berlinInstant(day, `${h}:${mi}`);
  return { ...berlinParts(at), at };
};

const RRULES: Record<Repeat, string> = {
  daily: "FREQ=DAILY",
  weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
  yearly: "FREQ=YEARLY",
};

/** A repeat Kontext knows, from an RRULE; anything finer (every second week …) is none. */
export const readRepeat = (rule: string): Repeat | null => {
  const parts = Object.fromEntries(
    rule.split(";").map((part) => part.split("=") as [string, string]),
  );
  if (parts.INTERVAL && parts.INTERVAL !== "1") return null;
  if (parts.COUNT || parts.UNTIL) return null;
  const weekdays = parts.BYDAY === "MO,TU,WE,TH,FR";
  if (weekdays && (parts.FREQ === "WEEKLY" || parts.FREQ === "DAILY")) return "weekdays";
  if (parts.BYDAY || parts.BYMONTHDAY || parts.BYMONTH) return null;
  return (
    ({ DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" } as const)[
      parts.FREQ as "DAILY"
    ] ?? null
  );
};

/** The VTODO of a task, in a VCALENDAR of its own. */
export const toVtodo = (task: Task, uid: string): string => {
  const done = task.status === "done";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kontext//Aufgaben//DE",
    "BEGIN:VTODO",
    `UID:${uid}`,
    `DTSTAMP:${utc(new Date(task.updatedAt))}`,
    `CREATED:${utc(new Date(task.createdAt))}`,
    `LAST-MODIFIED:${utc(new Date(task.updatedAt))}`,
    `SUMMARY:${writeText(task.title)}`,
    ...(task.notes ? [`DESCRIPTION:${writeText(task.notes)}`] : []),
    `STATUS:${done ? "COMPLETED" : task.status === "open" ? "NEEDS-ACTION" : "IN-PROCESS"}`,
    ...(done
      ? ["PERCENT-COMPLETE:100", `COMPLETED:${utc(new Date(task.completedAt ?? task.updatedAt))}`]
      : []),
    ...(task.dueDate
      ? [
          task.dueTime
            ? `DUE:${utc(berlinInstant(task.dueDate, task.dueTime))}`
            : `DUE;VALUE=DATE:${task.dueDate.replace(/-/g, "")}`,
        ]
      : []),
    ...(task.repeat && task.dueDate ? [`RRULE:${RRULES[task.repeat]}`] : []),
    ...(task.remindAt && !done
      ? [
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `DESCRIPTION:${writeText(task.title)}`,
          `TRIGGER;VALUE=DATE-TIME:${utc(new Date(task.remindAt))}`,
          "END:VALARM",
        ]
      : []),
    "END:VTODO",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
};

/** What a client's VTODO says, as Kontext keeps it; null when it holds no VTODO. */
export type IncomingTodo = {
  uid: string;
  title: string;
  notes: string;
  /** done, in progress, or not yet started. */
  state: "done" | "doing" | "open";
  dueDate: string | null;
  dueTime: string | null;
  remindAt: string | null;
  repeat: Repeat | null;
};

export const readVtodo = (text: string): IncomingTodo | null => {
  const props = parseLines(text);
  const start = props.findIndex((p) => p.name === "BEGIN" && p.value.toUpperCase() === "VTODO");
  if (start < 0) return null;
  const end = props.findIndex(
    (p, i) => i > start && p.name === "END" && p.value.toUpperCase() === "VTODO",
  );
  const todo = props.slice(start + 1, end < 0 ? undefined : end);
  // The properties of the task itself, not of an alarm inside it.
  const own: Prop[] = [];
  const alarms: Prop[][] = [];
  let alarm: Prop[] | null = null;
  for (const prop of todo) {
    if (prop.name === "BEGIN" && prop.value.toUpperCase() === "VALARM") alarm = [];
    else if (prop.name === "END" && prop.value.toUpperCase() === "VALARM") {
      if (alarm) alarms.push(alarm);
      alarm = null;
    } else if (alarm) alarm.push(prop);
    else own.push(prop);
  }
  const get = (name: string) => own.find((prop) => prop.name === name);
  const status = get("STATUS")?.value.toUpperCase();
  const due = get("DUE") ? readDate(get("DUE")!) : null;
  const trigger = alarms[0]?.find((prop) => prop.name === "TRIGGER");
  const remindAt = trigger ? triggerAt(trigger, due?.at ?? null) : null;
  return {
    uid: get("UID")?.value ?? "",
    title:
      readText(get("SUMMARY")?.value ?? "")
        .trim()
        .slice(0, 300) || "Ohne Titel",
    notes: readText(get("DESCRIPTION")?.value ?? "").slice(0, 10_000),
    state:
      status === "COMPLETED" || status === "CANCELLED" || get("COMPLETED")
        ? "done"
        : status === "IN-PROCESS"
          ? "doing"
          : "open",
    dueDate: due?.day ?? null,
    dueTime: due?.time ?? null,
    remindAt: remindAt?.toISOString() ?? null,
    repeat: get("RRULE") ? readRepeat(get("RRULE")!.value) : null,
  };
};

/** "-PT15M", "-P1D", "PT0S": a duration before (or after) the due time. */
const duration = (value: string): number | null => {
  const match = value.match(
    /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
  );
  if (!match) return null;
  const [, sign, w, d, h, m, s] = match;
  const ms =
    (((+(w ?? 0) * 7 + +(d ?? 0)) * 24 + +(h ?? 0)) * 60 + +(m ?? 0)) * 60_000 + +(s ?? 0) * 1000;
  return sign === "-" ? -ms : ms;
};

const triggerAt = (trigger: Prop, due: Date | null): Date | null => {
  if (trigger.params.VALUE === "DATE-TIME") return readDate(trigger)?.at ?? null;
  const offset = duration(trigger.value);
  return offset === null || !due ? null : new Date(due.getTime() + offset);
};
