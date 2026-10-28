/** German formatting of dates, sizes and names. `now` is passed in so the functions stay pure. */
import type { EmailAddress } from "@/jmap/types";
import { m } from "@/paraglide/messages";
import { LOCALE } from "./locale";

export const TIME_ZONE = "Europe/Berlin";

const dayKey = (date: Date): string =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE }).format(date);

const time = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});
const weekday = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, weekday: "short" });
const shortDate = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
});
const fullDate = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const longDateTime = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** For the message list: "09:41" today, "Gestern", "Mo" this week, "14.10." this year, else "14.10.2025". */
export const listDate = (iso: string, now: Date): string => {
  const date = new Date(iso);
  const days = Math.round((Date.parse(dayKey(now)) - Date.parse(dayKey(date))) / 86_400_000);
  if (days <= 0) return time.format(date);
  if (days === 1) return m.common_yesterday();
  if (days < 7) return weekday.format(date).replace(".", "");
  if (dayKey(date).slice(0, 4) === dayKey(now).slice(0, 4)) return shortDate.format(date);
  return fullDate.format(date);
};

/** For the reading pane: "Fr., 23. Oktober 2026, 09:41". */
export const readingDate = (iso: string): string => longDateTime.format(new Date(iso));

export const displayName = (address: EmailAddress | undefined | null): string =>
  address ? address.name?.trim() || address.email : "";

export const firstName = (address: EmailAddress | undefined | null): string =>
  displayName(address).split(/[\s@]/)[0] ?? "";

export const initials = (text: string): string => {
  const words = text
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters =
    words.length > 1 ? [words[0]![0], words.at(-1)![0]] : [words[0]?.[0], words[0]?.[1]];
  return letters.filter(Boolean).join("").toUpperCase();
};

export const formatAddressList = (addresses: EmailAddress[] | null | undefined): string =>
  (addresses ?? []).map(displayName).join(", ");

/** "Petra Keller <petra@keller-elektro.de>", or the bare address without a name. */
export const fullAddress = (address: EmailAddress): string =>
  address.name?.trim() ? `${address.name.trim()} <${address.email}>` : address.email;

const units = ["B", "KB", "MB", "GB", "TB"];

export const formatSize = (bytes: number): string => {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${value.toLocaleString(LOCALE, { maximumFractionDigits: digits })} ${units[unit]}`;
};
