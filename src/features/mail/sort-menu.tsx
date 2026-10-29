/** The list header's sort button: how the mail lists are ordered (sort-setting.ts). */
import { ArrowDownUp } from "lucide-react";
import { Fragment } from "react";
import {
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { DEFAULT_SORT, type MailSort, readMailSort } from "@/lib/mail-sort";
import { m } from "@/paraglide/messages";
import { setMailSort, useMailSort } from "./sort-setting";

export const SORT_NAMES: Record<MailSort, () => string> = {
  newest: m.mail_sort_newest,
  oldest: m.mail_sort_oldest,
  unread: m.mail_sort_unread,
  flagged: m.mail_sort_flagged,
  category: m.mail_sort_category,
  from: m.mail_sort_from,
  subject: m.mail_sort_subject,
  size: m.mail_sort_size,
};

/** Date first, then what puts some mails on top, then the plain orders. */
const SECTIONS: MailSort[][] = [
  ["newest", "oldest"],
  ["unread", "flagged", "category"],
  ["from", "subject", "size"],
];

export const SortMenu = () => {
  const sort = useMailSort();
  const changed = sort !== DEFAULT_SORT;
  const label = m.mail_sort_label({ order: SORT_NAMES[sort]() });
  return (
    <MenuRoot>
      <MenuTrigger
        aria-label={label}
        title={label}
        className={cn(
          "flex h-7 shrink-0 items-center gap-1 self-center rounded-md px-1.5 text-[12px] hover:bg-hover",
          changed ? "text-accent" : "text-muted",
        )}
      >
        <ArrowDownUp size={14} aria-hidden="true" />
        {/* Another order says which where there is room; on narrow lists the coloured icon does. */}
        {changed ? (
          <span className="hidden max-w-[140px] truncate xl:inline">{SORT_NAMES[sort]()}</span>
        ) : null}
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>{m.mail_sort_title()}</MenuLabel>
        <MenuRadioGroup value={sort} onValueChange={(value) => setMailSort(readMailSort(value))}>
          {SECTIONS.map((section, index) => (
            <Fragment key={section[0]}>
              {index > 0 ? <MenuSeparator /> : null}
              {section.map((choice) => (
                <MenuRadioItem key={choice} value={choice}>
                  {SORT_NAMES[choice]()}
                </MenuRadioItem>
              ))}
            </Fragment>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </MenuRoot>
  );
};
