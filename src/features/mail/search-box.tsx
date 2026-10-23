/**
 * The search field above every mail list. Enter searches all mail (`/mail/all/search?q=…`);
 * while typing it suggests contacts, folders, operators and the last searches.
 */
import { useNavigate } from "@tanstack/react-router";
import { Clock, Folder, Search, SlidersHorizontal, User, X } from "lucide-react";
import {
  forwardRef,
  type KeyboardEvent,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/cn";
import { contactAddresses } from "@/lib/jscontact";
import { mailboxPath } from "@/lib/mailboxes";
import {
  readRecent,
  rememberSearch,
  type SearchSuggestion,
  suggest,
} from "@/lib/search-suggestions";
import { m } from "@/paraglide/messages";
import { useContacts } from "../contacts/queries";
import { useAllMailboxes, useMailAccounts } from "./queries";

const ICONS = { contact: User, folder: Folder, operator: SlidersHorizontal, recent: Clock };

/** All folders by path, and the shared mailboxes ("info@"), for `in:`. */
const useFolderNames = (): string[] => {
  const accounts = useMailAccounts();
  const mailboxes = useAllMailboxes();
  return useMemo(() => {
    const names = new Set<string>();
    for (const account of accounts) {
      if (!account.isPersonal) names.add(account.name.replace(/@.*/, "@"));
      const list = mailboxes[account.id] ?? [];
      for (const mailbox of list) if (!mailbox.role) names.add(mailboxPath(mailbox, list));
    }
    return ["Posteingang", "Gesendet", "Entwürfe", "Archiv", "Papierkorb", "Spam", ...names];
  }, [accounts, mailboxes]);
};

export type SearchBoxHandle = { focus: () => void };

export const SearchBox = forwardRef<SearchBoxHandle, { initial?: string }>(({ initial }, ref) => {
  const navigate = useNavigate();
  const [text, setText] = useState(initial ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const { data: cards } = useContacts();
  const contacts = useMemo(() => contactAddresses(cards), [cards]);
  const folders = useFolderNames();
  const suggestions = useMemo(
    () => (open ? suggest(text, { contacts, folders, recent: readRecent() }) : []),
    [open, text, contacts, folders],
  );
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

  const submit = (query: string) => {
    const q = query.trim();
    setOpen(false);
    setHighlight(-1);
    if (!q) return;
    rememberSearch(q);
    input.current?.blur();
    void navigate({
      to: "/mail/$accountId/$mailboxId",
      params: { accountId: "all", mailboxId: "search" },
      search: { q },
    });
  };

  const pick = (suggestion: SearchSuggestion) => {
    setText(suggestion.value);
    setHighlight(-1);
    // Operators and people only start a search; a recent search runs at once.
    if (suggestion.kind === "recent") submit(suggestion.value);
    else input.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!suggestions.length) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      // -1 is the text itself; the arrows wrap around through it.
      setHighlight((h) => {
        const next = h + step;
        return next < -1 ? suggestions.length - 1 : next >= suggestions.length ? -1 : next;
      });
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = suggestions[highlight];
      if (chosen) pick(chosen);
      else submit(text);
    } else if (event.key === "Escape") {
      if (open && suggestions.length) setOpen(false);
      else {
        setText("");
        input.current?.blur();
      }
    }
  };

  return (
    <div className="relative">
      <label className="flex h-[42px] items-center gap-2 rounded-xl bg-subtle px-3 text-muted md:h-9 md:rounded-[9px] md:border md:border-border md:bg-transparent">
        <Search size={15} />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-label={m.mail_search()}
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={m.search_placeholder()}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-fg outline-none md:text-[14px] [&::-webkit-search-cancel-button]:hidden"
        />
        {text ? (
          <button
            type="button"
            aria-label={m.search_clear()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setText("");
              input.current?.focus();
            }}
            className="flex size-6 items-center justify-center rounded-md hover:bg-hover hover:text-fg"
          >
            <X size={14} />
          </button>
        ) : null}
      </label>
      {suggestions.length > 0 ? (
        <div
          id={listId}
          role="listbox"
          aria-label={m.search_title()}
          className="absolute inset-x-0 top-full z-30 mt-1 flex flex-col rounded-xl border border-border bg-bg p-1 shadow-lg"
        >
          {suggestions.map((suggestion, index) => {
            const Icon = ICONS[suggestion.kind];
            return (
              <div
                key={`${suggestion.kind}-${suggestion.value}`}
                role="option"
                tabIndex={-1}
                aria-selected={index === highlight}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(suggestion);
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[14px]",
                  index === highlight && "bg-hover",
                )}
              >
                <Icon size={14} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">
                  {suggestion.kind === "operator" ? (
                    <code className="font-mono text-[13px]">{suggestion.label}</code>
                  ) : (
                    suggestion.label
                  )}
                </span>
                {suggestion.detail ? (
                  <span className="truncate text-[12px] text-muted">{suggestion.detail}</span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});
SearchBox.displayName = "SearchBox";
