/** How full a mailbox is, for the ring around the avatar and the bar of a shared mailbox. */

export type StorageTone = "normal" | "warn" | "full";

/** Share of the limit in percent (0–100) and its tone; none without a limit. */
export const storageLevel = (
  used: number,
  limit: number | null,
): { percent: number; tone: StorageTone } | undefined => {
  if (!limit) return undefined;
  const percent = Math.min(100, Math.max(0, (used / limit) * 100));
  return { percent, tone: percent >= 95 ? "full" : percent >= 80 ? "warn" : "normal" };
};
