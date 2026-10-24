/**
 * "Mail, Aufgabe oder Kontakt verknüpfen": searches mails over all mailboxes (like the search,
 * without trash and spam), one's tasks or the contacts, and gives the picked one as a card.
 */
import { useQueries } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { useClient } from "@/auth/auth";
import { Dialog } from "@/components/ui/dialog";
import { useCategoryMap } from "@/features/categories/queries";
import { useContacts } from "@/features/contacts/queries";
import { LinkIcon } from "@/features/links/item-link";
import { useAllMailboxes, useMailAccounts } from "@/features/mail/queries";
import { useTasks } from "@/features/tasks/queries";
import { queryEmails } from "@/jmap/mail";
import { type Card, contactCard, mailCard, taskCard } from "@/lib/chat-cards";
import { cn } from "@/lib/cn";
import { dateKey } from "@/lib/jscalendar";
import { matchesSearch } from "@/lib/jscontact";
import { shortAddress } from "@/lib/mail-accounts";
import { parseSearch, toEmailFilter } from "@/lib/mail-search";
import { mailboxPath } from "@/lib/mailboxes";
import { m } from "@/paraglide/messages";

type Kind = "mail" | "task" | "contact";
type Hit = { card: Card; key: string };

const HITS = 12;

const useMailHits = (text: string, enabled: boolean): Hit[] => {
  const client = useClient();
  const accounts = useMailAccounts();
  const mailboxes = useAllMailboxes();
  const categories = useCategoryMap();
  const query = useMemo(() => parseSearch(text, dateKey(new Date())), [text]);
  const sources = accounts.flatMap((account) => {
    const list = mailboxes[account.id];
    const filter =
      list &&
      toEmailFilter(query, {
        label: account.isPersonal ? account.name : shortAddress(account.name),
        isPersonal: account.isPersonal,
        mailboxes: list,
        path: (mailbox) => mailboxPath(mailbox, list),
        categories: categories[account.id] ?? [],
      });
    return filter ? [{ accountId: account.id, filter }] : [];
  });
  const results = useQueries({
    queries: sources.map(({ accountId, filter }) => ({
      queryKey: [accountId, "emails", "pick", filter],
      queryFn: () => queryEmails(client, accountId, { search: filter }, 0, HITS),
      enabled,
    })),
  });
  return results
    .flatMap((result, index) =>
      (result.data?.emails ?? []).map((email) => ({
        email,
        accountId: sources[index]!.accountId,
      })),
    )
    .sort((a, b) => b.email.receivedAt.localeCompare(a.email.receivedAt))
    .slice(0, HITS)
    .map(({ email, accountId }) => ({
      key: `${accountId}/${email.id}`,
      card: mailCard(accountId, email),
    }));
};

const useHits = (kind: Kind, text: string): Hit[] => {
  const mails = useMailHits(text, kind === "mail");
  const { tasks } = useTasks();
  const { data: contacts = [] } = useContacts();
  const lower = text.trim().toLocaleLowerCase("de-DE");
  if (kind === "mail") return mails;
  if (kind === "task") {
    return tasks
      .filter((task) => task.status !== "done" || lower)
      .filter((task) => task.title.toLocaleLowerCase("de-DE").includes(lower))
      .slice(0, HITS)
      .map((task) => ({ key: task.id, card: taskCard(task) }));
  }
  return contacts
    .filter((contact) => !lower || matchesSearch(contact, lower))
    .slice(0, HITS)
    .map((contact) => ({ key: `${contact.accountId}/${contact.id}`, card: contactCard(contact) }));
};

export const LinkPicker = ({
  onPick,
  onClose,
  onClosed,
}: {
  onPick: (card: Card) => void;
  onClose: () => void;
  /** Takes the focus once the dialog is gone (instead of the button that opened it). */
  onClosed?: () => void;
}) => {
  const [kind, setKind] = useState<Kind>("mail");
  const [text, setText] = useState("");
  const hits = useHits(kind, useDeferredValue(text));
  const tabs: [Kind, string][] = [
    ["mail", m.chat_card_mail()],
    ["task", m.chat_card_task()],
    ["contact", m.chat_card_contact()],
  ];
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={m.chat_link()}
      onCloseAutoFocus={
        onClosed
          ? (event) => {
              event.preventDefault();
              onClosed();
            }
          : undefined
      }
    >
      <div role="tablist" className="flex gap-0.5 rounded-[9px] bg-subtle p-[3px]">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={kind === value}
            onClick={() => setKind(value)}
            className={cn(
              "h-8 flex-1 rounded-[7px] text-[13px]",
              kind === value ? "bg-bg font-medium text-fg shadow-sm" : "text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="flex h-10 items-center gap-2 rounded-[9px] border border-border px-3 text-muted focus-within:border-muted">
        <Search size={15} aria-hidden="true" />
        <span className="sr-only">{m.chat_link_search()}</span>
        <input
          type="search"
          value={text}
          placeholder={m.chat_link_search()}
          onChange={(event) => setText(event.target.value)}
          className="flex-1 bg-transparent text-[14px] text-fg outline-none"
        />
      </label>
      <ul
        aria-label={m.chat_link_hits()}
        className="m-0 flex max-h-80 list-none flex-col gap-px overflow-y-auto p-0"
      >
        {hits.length === 0 ? (
          <li className="px-2 py-6 text-center text-[14px] text-muted">{m.chat_link_none()}</li>
        ) : null}
        {hits.map(({ key, card }) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => {
                onPick(card);
                onClose();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-muted">
                <LinkIcon kind={card.kind} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[14px] font-medium">{card.label}</span>
                {card.detail ? (
                  <span className="truncate text-[12px] text-muted">{card.detail}</span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
};
