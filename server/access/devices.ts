/**
 * The browsers someone is signed in to Kontext with, for the Zugänge in the settings: what the
 * session table knows (server/db/schema.ts), turned into what a person recognises. Pure.
 */

/** One sign-in session as stored, with when its Stalwart token was last renewed. */
export type SessionRow = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Past it, the session is over, even while its row is still there. */
  expiresAt: Date;
  /** The grant's last renewal: the session was in use then (about every hour while open). */
  grantUpdatedAt: Date | null;
};

export type Device = {
  id: string;
  browser: string | null;
  system: string | null;
  ip: string | null;
  since: string;
  lastActive: string;
  current: boolean;
};

const BROWSERS: [RegExp, string][] = [
  [/\bEdg(A|iOS)?\//, "Edge"],
  [/\bOPR\//, "Opera"],
  [/\b(Firefox|FxiOS)\//, "Firefox"],
  [/\b(Chrome|CriOS)\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMac OS X\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

const firstMatch = (table: [RegExp, string][], text: string) =>
  table.find(([pattern]) => pattern.test(text))?.[1] ?? null;

/** "Firefox" on "Windows", from the browser's User-Agent; null for what it does not say. */
export const deviceOf = (userAgent: string | null) => ({
  browser: userAgent ? firstMatch(BROWSERS, userAgent) : null,
  system: userAgent ? firstMatch(SYSTEMS, userAgent) : null,
});

const lastActiveOf = (row: SessionRow) =>
  row.grantUpdatedAt && row.grantUpdatedAt > row.updatedAt ? row.grantUpdatedAt : row.updatedAt;

/**
 * The browser sessions among `rows`, this one first, then the most recently used. `heldIds` are
 * the sessions behind app passwords and agents: they have their own place in the overview.
 * Sessions past `expiresAt` are left out: Better Auth deletes one only when its cookie comes again,
 * which a cookie that ran out with it never does.
 */
export const devicesOf = (
  rows: SessionRow[],
  heldIds: Set<string>,
  currentId: string,
  now = new Date(),
): Device[] =>
  rows
    .filter((row) => !heldIds.has(row.id) && row.expiresAt > now)
    .map((row) => ({ row, lastActive: lastActiveOf(row) }))
    .sort(
      (a, b) =>
        Number(b.row.id === currentId) - Number(a.row.id === currentId) ||
        b.lastActive.getTime() - a.lastActive.getTime(),
    )
    .map(({ row, lastActive }) => ({
      id: row.id,
      ...deviceOf(row.userAgent),
      ip: row.ipAddress,
      since: row.createdAt.toISOString(),
      lastActive: lastActive.toISOString(),
      current: row.id === currentId,
    }));
