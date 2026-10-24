/**
 * The middle column's frame: title, search, filter and the virtualized rows. The data comes from
 * one folder (`MessageList`) or from the inboxes of all accounts (`UnifiedList`).
 */
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Menu, Paperclip, SquarePen, Star, Users } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Highlighted } from "@/components/highlighted";
import { TabBar } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { useShortcuts } from "@/components/use-shortcuts";
import { isFlagged, isUnread } from "@/jmap/mail";
import type { EmailSummary } from "@/jmap/types";
import { categoriesOn } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { displayName, formatAddressList, listDate } from "@/lib/format";
import { m } from "@/paraglide/messages";
import type { MailSearch } from "@/routes/_app/mail.$accountId.$mailboxId";
import { CategoryChips } from "../categories/category-chips";
import { useCategoryMap } from "../categories/queries";
import { type DraggedMail, startMailDrag } from "./mail-drag";
import { SearchBox, type SearchBoxHandle } from "./search-box";

/**
 * A mail in the list. `account` is set in the combined lists (`label` empty for the own account,
 * which needs no badge); search results also name their `folder` and the words to `highlight`.
 */
export type Row = {
  email: EmailSummary;
  /** `title` explains the badge, e.g. "Gemeinsames Postfach info@…". */
  account?: { id: string; label: string; title?: string };
  folder?: string;
  highlight?: string[];
};

type Props = {
  title: string;
  /** Next to the title, e.g. the shared mailbox's address. */
  subtitle?: ReactNode;
  /** Shown on the phone's folder button. */
  accountLabel: string;
  unread: number;
  rows: Row[];
  isPending: boolean;
  isFetchingMore: boolean;
  onNearEnd: () => void;
  search: MailSearch;
  showRecipient: boolean;
  isDraft: boolean;
  /** Instead of "Alle / Ungelesen", e.g. the search's chips. */
  filters?: ReactNode;
  /** Shown when the list is empty. */
  empty?: string;
  /** What dragging a row carries onto a folder; rows without it cannot be dragged. */
  dragMail?: (row: Row) => DraggedMail | undefined;
};

export const ListFrame = ({
  title,
  subtitle,
  accountLabel,
  unread,
  rows,
  isPending,
  isFetchingMore,
  onNearEnd,
  search,
  showRecipient,
  isDraft,
  filters,
  empty,
  dragMail,
}: Props) => {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<SearchBoxHandle>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 92,
    overscan: 8,
  });
  const items = virtualizer.getVirtualItems();
  const lastIndex = items.at(-1)?.index ?? -1;
  const near = lastIndex >= rows.length - 10;

  useEffect(() => {
    if (near) onNearEnd();
  }, [near, onNearEnd]);

  /** j / k: the next or previous mail of the list. */
  const step = (by: 1 | -1) => {
    const current = rows.findIndex(
      (row) => row.email.id === search.email && (!row.account || row.account.id === search.account),
    );
    const next = rows[current === -1 ? 0 : current + by];
    if (!next) return;
    virtualizer.scrollToIndex(rows.indexOf(next), { align: "auto" });
    void navigate({
      to: ".",
      search: (prev) => ({
        ...prev,
        email: next.email.id,
        account: next.account?.id,
        compose: isDraft ? "draft" : undefined,
      }),
    });
  };
  useShortcuts({
    c: () => void navigate({ to: ".", search: { compose: "new" } }),
    "/": () => searchRef.current?.focus(),
    j: () => step(1),
    k: () => step(-1),
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-3 px-4 pt-3 pb-3 md:pt-4">
        <div className="flex items-center justify-between md:hidden">
          <Link
            to="."
            search={(prev) => ({ ...prev, folders: true })}
            className="flex h-8 items-center gap-2 rounded-full border border-border px-3 text-[13px] text-fg no-underline"
          >
            <Menu size={14} />
            <span className="max-w-[200px] truncate">{accountLabel}</span>
          </Link>
          <Button asChild variant="primary" size="iconSm" aria-label={m.mail_compose()}>
            <Link to="." search={{ compose: "new" }}>
              <SquarePen size={16} />
            </Link>
          </Button>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="m-0 truncate text-[30px] leading-tight font-semibold tracking-tight md:text-[18px]">
            {title}
            {subtitle ? (
              <span className="ml-2 text-[15px] font-normal text-muted md:text-[13px]">
                {subtitle}
              </span>
            ) : null}
          </h1>
          <span className="shrink-0 text-[12px] text-muted">
            {unread > 0 ? m.mail_unread_count({ count: unread }) : ""}
          </span>
        </div>
        <SearchBox ref={searchRef} key={search.q ?? ""} initial={search.q} />
        {filters ?? (
          <nav
            aria-label="Filter"
            className="flex gap-1 self-start rounded-[9px] bg-subtle p-[3px]"
          >
            {[
              { label: m.mail_filter_all(), on: !search.unread, value: undefined },
              { label: m.mail_filter_unread(), on: Boolean(search.unread), value: true },
            ].map((option) => (
              <Link
                key={option.label}
                to="."
                search={(prev) => ({ ...prev, unread: option.value })}
                aria-pressed={option.on}
                className={cn(
                  "flex h-7 items-center rounded-[7px] px-3 text-[13px] no-underline",
                  option.on ? "bg-bg text-fg shadow-sm" : "text-muted",
                )}
              >
                {option.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {isPending ? (
          <p className="px-3 py-6 text-[14px] text-muted">{m.common_loading()}</p>
        ) : rows.length === 0 ? (
          <p className="px-3 py-6 text-[14px] text-muted">{empty ?? m.mail_empty()}</p>
        ) : (
          <ul
            aria-label={title}
            className="relative m-0 list-none p-0"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {items.map((item) => {
              const row = rows[item.index]!;
              return (
                <li
                  key={`${row.account?.id ?? ""}/${row.email.id}`}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute inset-x-0"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <MessageRow
                    row={row}
                    active={
                      row.email.id === search.email &&
                      (!row.account || row.account.id === search.account)
                    }
                    showRecipient={showRecipient}
                    isDraft={isDraft}
                    drag={dragMail?.(row)}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {isFetchingMore ? (
          <p className="px-3 py-2 text-[13px] text-muted">{m.common_loading()}</p>
        ) : null}
      </div>
      <TabBar />
    </div>
  );
};

const MessageRow = ({
  row: { email, account, folder, highlight },
  active,
  showRecipient,
  isDraft,
  drag,
}: {
  row: Row;
  active: boolean;
  showRecipient: boolean;
  /** A draft opens in the composer to be finished. */
  isDraft: boolean;
  drag: DraggedMail | undefined;
}) => {
  const unread = isUnread(email);
  // Combined lists name each row's account; a folder's list is the route's account.
  const routeAccount = useParams({ strict: false }).accountId;
  const categories = categoriesOn(
    email.keywords,
    useCategoryMap()[account?.id ?? routeAccount ?? ""] ?? [],
  );
  const who = showRecipient ? formatAddressList(email.to) : displayName(email.from?.[0]);
  return (
    <Link
      to="."
      search={(prev) => ({
        ...prev,
        email: email.id,
        account: account?.id,
        compose: isDraft ? "draft" : undefined,
      })}
      aria-current={active ? "true" : undefined}
      draggable={drag ? true : undefined}
      onDragStart={drag ? (event) => startMailDrag(event, drag) : (event) => event.preventDefault()}
      className={cn(
        "flex gap-3 rounded-[10px] px-3 py-3 text-left text-fg no-underline hover:bg-hover",
        active && "bg-subtle",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-[7px] size-1.5 shrink-0 rounded-full",
          unread ? "bg-accent" : "bg-transparent",
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className={cn("min-w-0 flex-1 truncate", unread && "font-semibold")}>
            <Highlighted text={who || "—"} terms={highlight} />
          </span>
          {isFlagged(email) ? (
            <Star
              size={12}
              className="shrink-0 fill-warn text-warn"
              aria-label={m.mail_flagged()}
            />
          ) : null}
          <span className="shrink-0 font-mono text-[12px] text-muted">
            {listDate(email.receivedAt, new Date())}
          </span>
        </span>
        <span className={cn("truncate", unread && "font-semibold")}>
          <Highlighted text={email.subject || m.mail_no_subject()} terms={highlight} />
        </span>
        <span className="flex items-center gap-1.5 text-[13px] text-muted">
          {folder ? (
            <span className="shrink-0 rounded-md border border-border px-1.5 text-[11px] text-muted">
              {folder}
            </span>
          ) : null}
          {account?.label ? (
            <span
              title={account.title}
              className="flex shrink-0 items-center gap-1 rounded-md bg-subtle px-1.5 text-[11px] font-medium text-muted"
            >
              <Users size={11} strokeWidth={2} aria-hidden="true" />
              {account.label}
            </span>
          ) : null}
          <CategoryChips categories={categories} max={2} />
          {email.hasAttachment ? (
            <Paperclip size={12} className="shrink-0" aria-label={m.mail_attachments()} />
          ) : null}
          <span className="truncate">
            <Highlighted text={email.preview} terms={highlight} />
          </span>
        </span>
      </span>
    </Link>
  );
};
