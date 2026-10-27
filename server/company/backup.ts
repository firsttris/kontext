/**
 * The Datensicherung in the Firmenverwaltung. Kontext never runs the backup itself: it has no
 * access to the host, to Restic or to the backup's keys. It talks to the host only through files
 * in its data volume (`backup-control/`): it writes the wish (settings.json, run-now), the host
 * (deploy/backup-control.sh, run by systemd units) writes what happened (status.json, log.txt).
 * Not /data/backup: backup.sh puts the database copy there, and that directory is backed up.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import {
  type BackupSettings,
  type BackupStatus,
  type BackupView,
  backupSettingsSchema,
  backupStatusSchema,
  DEFAULT_SETTINGS,
  hostState,
} from "./backup-schema";

export type { BackupSettings, BackupStatus, BackupView };

const LOG_LIMIT = 64 * 1024;

/** JSON from a file of the host, or null when it is missing or not JSON. */
const parse = <T>(text: string | null, schema: z.ZodType<T>): T | null => {
  if (text === null) return null;
  try {
    const result = schema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

export type BackupControl = {
  read: () => Promise<BackupView>;
  saveSettings: (settings: BackupSettings) => Promise<void>;
  requestRun: () => Promise<void>;
};

export const createBackupControl = (dir: string, now = () => Date.now()): BackupControl => {
  const path = (name: string) => join(dir, name);
  const text = (name: string) => readFile(path(name), "utf8").catch(() => null);
  const modified = (name: string) =>
    stat(path(name)).then(
      (stats) => stats.mtimeMs,
      () => null,
    );
  /** Written beside and renamed: the host never sees half a file. */
  const writeAtomic = async (name: string, content: string) => {
    await mkdir(dir, { recursive: true });
    const temporary = path(`.${name}.${randomUUID()}.tmp`);
    await writeFile(temporary, content);
    await rename(temporary, path(name));
  };

  return {
    read: async () => {
      const [settingsText, statusText, log, settingsAt, runAt] = await Promise.all([
        text("settings.json"),
        text("status.json"),
        text("log.txt"),
        modified("settings.json"),
        modified("run-now"),
      ]);
      const status = parse(statusText, backupStatusSchema);
      const settings =
        parse(settingsText, backupSettingsSchema) ?? status?.schedule ?? DEFAULT_SETTINGS;
      const wishes = [settingsAt, runAt].filter((at) => at !== null);
      const lastWish = wishes.length ? Math.max(...wishes) : null;
      return {
        settings,
        status,
        requested: runAt !== null,
        host: hostState(status, lastWish, now()),
        log: (log ?? "").slice(-LOG_LIMIT),
      };
    },
    saveSettings: (settings) => writeAtomic("settings.json", `${JSON.stringify(settings)}\n`),
    requestRun: () => writeAtomic("run-now", `${new Date(now()).toISOString()}\n`),
  };
};
