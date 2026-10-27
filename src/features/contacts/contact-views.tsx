/** Above the contacts list: "Weitere Kontakte" and "Zusammenführen und korrigieren" with its count. */
import { Link } from "@tanstack/react-router";
import { Archive, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { useCleanup } from "./cleanup";

const Entry = ({
  manage,
  current,
  icon,
  label,
  count,
}: {
  manage: "other" | "cleanup";
  current: boolean;
  icon: ReactNode;
  label: string;
  count?: number;
}) => (
  <li>
    <Link
      to="/contacts"
      search={{ manage }}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-[10px] px-3 py-2 text-[14px] text-fg no-underline hover:bg-hover",
        current && "bg-bg shadow-[0_0_0_1px_var(--border)]",
      )}
    >
      <span className="flex size-[34px] shrink-0 items-center justify-center text-muted md:size-6">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count ? (
        <span className="rounded-full bg-danger px-1.5 text-[11px] font-medium text-white">
          {count}
        </span>
      ) : null}
    </Link>
  </li>
);

export const ContactViews = ({ manage }: { manage: "other" | "cleanup" | undefined }) => {
  const { duplicates, fixes } = useCleanup();
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 border-b border-border p-0 pt-1 pb-2">
      <Entry
        manage="other"
        current={manage === "other"}
        icon={<Archive size={16} />}
        label={m.contacts_other()}
      />
      <Entry
        manage="cleanup"
        current={manage === "cleanup"}
        icon={<Wrench size={16} />}
        label={m.contacts_cleanup()}
        count={duplicates.length + fixes.length}
      />
    </ul>
  );
};
