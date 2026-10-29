/**
 * The middle column's frame: title, search, filter and the virtualized rows. The data comes from
 * one folder (`MessageList`) or from the inboxes of all accounts (`UnifiedList`).
 */
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Menu, SquarePen } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { TabBar } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { useShortcuts } from "@/components/use-shortcuts";
import { DeviceOffer } from "@/features/notifications/device-offer";
import type { EmailSummary } from "@/jmap/types";
import { cn } from "@/lib/cn";
import { addRange, keepListed, type Picked, pickKey, toggleKey } from "@/lib/selection";
import { m } from "@/paraglide/messages";
import type { MailSearch } from "@/routes/_app/mail.$accountId.$mailboxId";
import { useFileDrop } from "./eml-import";
import type { DraggedMail } from "./mail-drag";
import { MessageRow } from "./message-row";
import { useMailAccounts } from "./queries";
import { SearchBox, type SearchBoxHandle } from "./search-box";
import { SelectionBar } from "./selection-bar";
import { SortMenu } from "./sort-menu";
import { useSwipeAction } from "./swipe-action";
import { useThreadView } from "./thread-view";
import { useThreadInfo } from "./use-thread-info";

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
  /** Still held by the server, to go out then (ISO). */
  sendAt?: string;
  /** On Wiedervorlage, back in the inbox then (ISO). */
  snoozedUntil?: string;
  /** A heading above the row, where a part of the list begins ("Wieder vorgelegt"). */
  section?: string;
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
  /** An action for the whole folder below the filters, e.g. "Papierkorb leeren". */
  folderAction?: ReactNode;
  /** A small button at the end of the filters' row, e.g. "E-Mails importieren". */
  listAction?: ReactNode;
  /** Files dropped onto the list (.eml to import); without it the list takes no files. */
  onDropFiles?: (files: File[]) => void;
  /** What dragging a row carries onto a folder; rows without it cannot be dragged. */
  dragMail?: (row: Row) => DraggedMail | undefined;
  /** The open folder, for actions on picked mails; none in combined lists. */
  folderId?: string;
  inJunk?: boolean;
  /** Whether the list follows the sort choice; Wiedervorlage and "Geplant" keep their own order. */
  sortable?: boolean;
};

/** "Alle / Ungelesen" and the like: each chip sets part of the search. */
export const FilterChips = ({
  options,
}: {
  options: { label: string; on: boolean; set: Partial<MailSearch> }[];
}) => (
  <nav aria-label="Filter" className="flex gap-1 self-start rounded-[9px] bg-subtle p-[3px]">
    {options.map((option) => (
      <Link
        key={option.label}
        to="."
        search={(prev) => ({ ...prev, ...option.set })}
        aria-current={option.on ? "page" : undefined}
        className={cn(
          "flex h-7 items-center rounded-[7px] px-3 text-[13px] no-underline",
          option.on ? "bg-bg text-fg shadow-sm" : "text-muted",
        )}
      >
        {option.label}
      </Link>
    ))}
  </nav>
);

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
  folderAction,
  listAction,
  onDropFiles,
  dragMail,
  folderId,
  inJunk = false,
  sortable = true,
}: Props) => {
  const fileDrop = useFileDrop(onDropFiles);
  // Combined lists name each row's account; a folder's list is the route's account.
  const routeAccount = useParams({ strict: false }).accountId ?? "";
  const accountOf = (row: Row) => row.account?.id ?? routeAccount;
  const grouped = useThreadView();
  const swipe = useSwipeAction(folderId);
  const { answers, groups } = useThreadInfo(rows, accountOf, grouped);
  const personal = new Set(
    useMailAccounts()
      .filter((account) => account.isPersonal)
      .map((account) => account.id),
  );
  const order = rows.map((row) => pickKey(accountOf(row), row.email.id));
  const [picks, setPicks] = useState<{ keys: Set<string>; anchor?: string }>({ keys: new Set() });
  const [selecting, setSelecting] = useState(false);
  const selected = keepListed(picks.keys, order);
  const picked: Picked[] = rows
    .filter((row) => selected.has(pickKey(accountOf(row), row.email.id)))
    .map((row) => ({ accountId: accountOf(row), email: row.email }));
  const clear = () => {
    setPicks({ keys: new Set() });
    setSelecting(false);
  };
  const pick = (key: string, shift: boolean) =>
    setPicks((current) => ({
      keys: shift
        ? addRange(keepListed(current.keys, order), order, current.anchor, key)
        : toggleKey(keepListed(current.keys, order), key),
      anchor: key,
    }));
  // Another folder or search: start without a selection.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the list's identity matters
  useEffect(() => {
    setPicks({ keys: new Set() });
    setSelecting(false);
  }, [title, search.q, search.unread]);
  const showBar = selecting || picked.length > 0;
  const chips = filters ?? (
    <FilterChips
      options={[
        { label: m.mail_filter_all(), on: !search.unread, set: { unread: undefined } },
        { label: m.mail_filter_unread(), on: Boolean(search.unread), set: { unread: true } },
      ]}
    />
  );
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<SearchBoxHandle>(null);
  const rowKey = (row: Row) => `${row.account?.id ?? ""}/${row.email.id}/${row.section ?? ""}`;
  const virtualizer = useVirtualizer({
    count: rows.length,
    // Heights follow the row, not its place: a heading above ("Wieder vorgelegt") shifts rows.
    getItemKey: (index) => (rows[index] ? rowKey(rows[index]) : index),
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
    // x: the open mail into the selection, as in Gmail.
    x: () => {
      const open = rows.find(
        (row) =>
          row.email.id === search.email && (!row.account || row.account.id === search.account),
      );
      if (open) pick(pickKey(accountOf(open), open.email.id), false);
    },
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-3 px-4 pt-3 pb-3 md:pt-4">
        <div className="flex items-center justify-between md:hidden">
          <Link
            to="."
            search={(prev) => ({ ...prev, folders: true })}
            data-tour="shared"
            className="flex h-8 items-center gap-2 rounded-full border border-border px-3 text-[13px] text-fg no-underline"
          >
            <Menu size={14} />
            <span className="max-w-[200px] truncate">{accountLabel}</span>
          </Link>
          <Button asChild variant="primary" size="iconSm" aria-label={m.mail_compose()}>
            <Link to="." search={{ compose: "new" }} data-tour="compose">
              <SquarePen size={16} />
            </Link>
          </Button>
        </div>
        {showBar ? (
          <SelectionBar
            picked={picked}
            allPicked={picked.length === rows.length && rows.length > 0}
            onPickAll={() => setPicks({ keys: new Set(order) })}
            onClear={clear}
            folderId={folderId}
            inJunk={inJunk}
          />
        ) : (
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="m-0 truncate text-[30px] leading-tight font-semibold tracking-tight md:text-[18px]">
              {title}
              {subtitle ? (
                <span className="ml-2 text-[15px] font-normal text-muted md:text-[13px]">
                  {subtitle}
                </span>
              ) : null}
            </h1>
            <div className="flex shrink-0 items-center gap-2 self-center">
              <span className="text-[12px] text-muted">
                {unread > 0 ? m.mail_unread_count({ count: unread }) : ""}
              </span>
              {sortable ? <SortMenu /> : null}
              {/* Phones have no hover: picking starts with this. */}
              {rows.length ? (
                <button
                  type="button"
                  onClick={() => setSelecting(true)}
                  className="self-center text-[14px] font-medium text-accent md:hidden"
                >
                  {m.mail_select_mode()}
                </button>
              ) : null}
            </div>
          </div>
        )}
        <SearchBox ref={searchRef} key={search.q ?? ""} initial={search.q} />
        {listAction ? (
          <div className="flex items-center justify-between gap-2">
            {chips}
            {listAction}
          </div>
        ) : (
          chips
        )}
        {folderAction}
      </header>
      <DeviceOffer />

      <div
        ref={scrollRef}
        {...fileDrop}
        className="min-h-0 flex-1 overflow-y-auto rounded-lg px-2 pb-3 data-[drop-over]:bg-hover data-[drop-over]:ring-1 data-[drop-over]:ring-accent data-[drop-over]:ring-inset"
      >
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
                  key={rowKey(row)}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute inset-x-0"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  {row.section ? (
                    <h2 className="m-0 px-3 pt-3 pb-1 text-[12px] font-medium text-muted">
                      {row.section}
                    </h2>
                  ) : null}
                  <MessageRow
                    row={row}
                    active={
                      row.email.id === search.email &&
                      (!row.account || row.account.id === search.account)
                    }
                    showRecipient={showRecipient}
                    isDraft={isDraft}
                    drag={dragMail?.(row)}
                    selecting={showBar}
                    selected={selected.has(pickKey(accountOf(row), row.email.id))}
                    onPick={(shift) => pick(pickKey(accountOf(row), row.email.id), shift)}
                    answer={answers.get(pickKey(accountOf(row), row.email.id))}
                    group={groups.get(pickKey(accountOf(row), row.email.id))}
                    shared={!personal.has(accountOf(row))}
                    onSwipe={(action) =>
                      swipe(
                        accountOf(row),
                        row.email,
                        action,
                        groups.get(pickKey(accountOf(row), row.email.id)),
                      )
                    }
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
