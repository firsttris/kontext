/**
 * What Kontext and the host write to each other for the Datensicherung (backup.ts), and how to
 * read it; pure, so the app uses the same rule for the time.
 */
import { z } from "zod";

/** The same rule as deploy/backup-control.sh: anything else is ignored by the host. */
export const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export const backupSettingsSchema = z.object({
  enabled: z.boolean(),
  time: z.string().regex(TIME),
});
export type BackupSettings = z.infer<typeof backupSettingsSchema>;

const iso = z.iso.datetime({ offset: true });

/** What the host reports; read leniently, a field it cannot say is left out. */
export const backupStatusSchema = z.object({
  state: z.enum(["idle", "running"]),
  updatedAt: iso,
  lastRun: z
    .object({ start: iso, end: iso.nullable(), ok: z.boolean(), message: z.string().max(500) })
    .nullable()
    .catch(null),
  sizeBytes: z.number().nonnegative().nullable().catch(null),
  warnGb: z.number().positive().catch(8),
  nextRun: iso.nullable().catch(null),
  target: z.string().max(200).catch(""),
  /** The timer as the host has it, for when Kontext never wrote settings.json. */
  schedule: backupSettingsSchema.nullable().catch(null),
});
export type BackupStatus = z.infer<typeof backupStatusSchema>;

/**
 * Whether the host side is set up and answers: "missing" without status.json, "stale" when a
 * wish of Kontext was not taken up within a few minutes or a planned run is long overdue.
 */
export type HostState = "ready" | "missing" | "stale";

export type BackupView = {
  settings: BackupSettings;
  status: BackupStatus | null;
  /** A run was asked for and the host has not taken it up yet. */
  requested: boolean;
  host: HostState;
  log: string;
};

const PICKUP_MS = 3 * 60_000;
const OVERDUE_MS = 6 * 3_600_000;
export const DEFAULT_SETTINGS: BackupSettings = { enabled: true, time: "03:00" };

/** The host's state from its status and when Kontext last wrote a wish (ms, or null). */
export const hostState = (
  status: BackupStatus | null,
  lastWish: number | null,
  now: number,
): HostState => {
  if (!status) return "missing";
  const updated = Date.parse(status.updatedAt);
  // The host writes whole seconds: an answer in the same second as the wish took it up.
  const answered = updated + 1000;
  if (lastWish !== null && lastWish >= answered && now - lastWish > PICKUP_MS) return "stale";
  const next = status.nextRun ? Date.parse(status.nextRun) : null;
  if (status.state === "idle" && next !== null && now - next > OVERDUE_MS) return "stale";
  return "ready";
};
