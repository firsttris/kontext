/**
 * The user's avatar in the rail and the tab bar, ringed by how full their mailbox is: a thin
 * track, filled in the accent colour, yellow from 80 %, red from 95 % (src/lib/storage.ts).
 */
import { useQuery } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { Avatar } from "@/components/ui/avatar";
import { CAPABILITIES } from "@/jmap/client";
import { getQuota, type Quota } from "@/jmap/mail";
import { cn } from "@/lib/cn";
import { formatSize } from "@/lib/format";
import { storageLevel } from "@/lib/storage";
import { m } from "@/paraglide/messages";
import { useSession } from "./session";

/** The own mailbox's storage; same cache key as the mail app's useQuota. */
export const useOwnQuota = (): Quota | null | undefined => {
  const client = useClient();
  const { data: session } = useSession();
  const accountId = session?.primaryAccounts[CAPABILITIES.mail];
  return useQuery({
    queryKey: [accountId, "quota"],
    queryFn: () => getQuota(client, accountId!),
    enabled: Boolean(accountId),
  }).data;
};

/** "1,2 GB von 5 GB belegt (24 %)", or only what is used without a limit. */
export const storageText = (quota: Quota): string => {
  const level = storageLevel(quota.used, quota.limit);
  return level && quota.limit
    ? m.storage_used({
        used: formatSize(quota.used),
        total: formatSize(quota.limit),
        percent: Math.round(level.percent),
      })
    : formatSize(quota.used);
};

const TONE = { normal: "text-accent", warn: "text-warn", full: "text-danger" } as const;

export const AccountAvatar = ({ name, size }: { name: string; size: number }) => {
  const quota = useOwnQuota();
  const level = quota ? storageLevel(quota.used, quota.limit) : undefined;
  const stroke = size > 28 ? 2.5 : 2;
  const outer = size + 2 * (stroke + 2);
  const radius = (outer - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: outer, height: outer }}>
      {level ? (
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${outer} ${outer}`}
          className="absolute inset-0 -rotate-90"
        >
          <circle
            cx={outer / 2}
            cy={outer / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-border"
          />
          {/* Below 1 % only the track: a lone round cap would look like a stray dot. */}
          {level.percent >= 1 ? (
            <circle
              cx={outer / 2}
              cy={outer / 2}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - level.percent / 100)}
              className={cn("stroke-current transition-[stroke-dashoffset]", TONE[level.tone])}
            />
          ) : null}
        </svg>
      ) : null}
      <span className="absolute inset-0 flex items-center justify-center">
        <Avatar name={name} size={size} />
      </span>
    </span>
  );
};

/** For the user menu: the text and a slim bar. */
export const StorageSummary = () => {
  const quota = useOwnQuota();
  if (!quota) return null;
  const level = storageLevel(quota.used, quota.limit);
  return (
    <div className="flex flex-col gap-1.5 px-2.5 pt-1 pb-2">
      <span className="text-[12px] text-muted">{storageText(quota)}</span>
      {level ? (
        <span className="h-1 overflow-hidden rounded-full bg-subtle">
          <span
            className={cn("block h-full rounded-full bg-current", TONE[level.tone])}
            style={{ width: `${Math.max(level.percent, 1.5)}%` }}
          />
        </span>
      ) : null}
    </div>
  );
};
