/** How the Datensicherung's times and size read in the Firmenverwaltung; `now` is passed in. */
import { m } from "@/paraglide/messages";
import { TIME_ZONE } from "./format";
import { LOCALE } from "./locale";

const dayKey = (date: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE }).format(date);
const clock = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});
const day = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

/** "heute 03:00", "gestern 03:00", "morgen 03:00", else "Mo., 26.10. 03:00". */
export const dayAndTime = (iso: string, now: Date): string => {
  const date = new Date(iso);
  const time = clock.format(date);
  const days = Math.round((Date.parse(dayKey(date)) - Date.parse(dayKey(now))) / 86_400_000);
  if (days === 0) return m.backup_today({ time });
  if (days === -1) return m.backup_yesterday({ time });
  if (days === 1) return m.backup_tomorrow({ time });
  return `${day.format(date)} ${time}`;
};

/** "unter 1 Min", "4 Min", "1 Std 5 Min". */
export const duration = (startIso: string, endIso: string): string => {
  const minutes = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000);
  if (minutes < 1) return m.backup_under_minute();
  if (minutes < 60) return m.backup_minutes({ minutes });
  return m.backup_hours({ hours: Math.floor(minutes / 60), minutes: minutes % 60 });
};

/** The free tiers (Cloudflare R2, Backblaze B2) end at 10 GB; a higher warning moves the end. */
export const FREE_GB = 10;

/** How full the storage is, 0 to 1, against the larger of 10 GB and the warning; over it or not. */
export const storage = (sizeBytes: number, warnGb: number) => {
  const gb = 1024 ** 3;
  return {
    limitBytes: Math.max(FREE_GB, warnGb) * gb,
    share: Math.min(1, sizeBytes / (Math.max(FREE_GB, warnGb) * gb)),
    over: sizeBytes > warnGb * gb,
  };
};
