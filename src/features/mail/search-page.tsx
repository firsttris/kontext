/**
 * Search results over all folders and mailboxes (`/mail/all/search?q=…`), like Gmail: operators,
 * chips for the common filters, the folder of each hit and the words marked. Trash and spam only
 * with `in:papierkorb` / `in:spam`.
 */
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import type { Mailbox } from "@/jmap/types";
import { cn } from "@/lib/cn";
import { dateKey } from "@/lib/jscalendar";
import {
  highlightTerms,
  parseSearch,
  sinceDays,
  toEmailFilter,
  toggleToken,
  tokenize,
} from "@/lib/mail-search";
import { findRole, mailboxName, mailboxPath } from "@/lib/mailboxes";
import { m } from "@/paraglide/messages";
import type { MailSearch } from "@/routes/_app/mail.$accountId.$mailboxId";
import { Composer } from "./composer";
import type { Row } from "./list-frame";
import { MailLayout } from "./mail-layout";
import { MailSidebar } from "./mail-sidebar";
import { MergedList, type Source } from "./merged-list";
import { MessageView } from "./message-view";
import { useAllMailboxes, useEmail, useMailAccounts } from "./queries";

export const SearchPage = ({ search }: { search: MailSearch }) => {
  const accounts = useMailAccounts();
  const own = accounts.find((account) => account.isPersonal);
  const mailboxes = useAllMailboxes();
  const today = dateKey(new Date());
  const query = useMemo(() => parseSearch(search.q ?? "", today), [search.q, today]);
  const terms = useMemo(() => highlightTerms(query), [query]);

  const sources = useMemo(
    () =>
      accounts.flatMap((account): Source[] => {
        const list = mailboxes[account.id];
        if (!list) return [];
        const filter = toEmailFilter(query, {
          label: account.isPersonal ? account.name : account.name.replace(/@.*/, "@"),
          isPersonal: account.isPersonal,
          mailboxes: list,
          path: (mailbox) => mailboxPath(mailbox, list),
        });
        return filter ? [{ account, filter: { search: filter } }] : [];
      }),
    [accounts, mailboxes, query],
  );

  /** The folder a hit lies in, and the words to mark. */
  const decorate = useCallback(
    (row: Row): Row => {
      const list = mailboxes[row.account?.id ?? ""] ?? [];
      const folder = list.find((mailbox) => row.email.mailboxIds[mailbox.id]);
      return { ...row, folder: folder ? mailboxName(folder) : undefined, highlight: terms };
    },
    [mailboxes, terms],
  );

  const readerAccount = search.account ?? own?.id;
  const composeAccount = search.compose === "new" ? own?.id : readerAccount;

  return (
    <MailLayout
      search={search}
      sidebar={own ? <MailSidebar accountId={own.id} mailbox={undefined} view="search" /> : null}
      list={
        <MergedList
          sources={sources}
          search={search}
          title={m.search_title()}
          subtitle={(total) => m.search_results({ count: total })}
          unread={0}
          filters={<SearchChips q={search.q ?? ""} today={today} />}
          empty={m.search_empty()}
          decorate={decorate}
        />
      }
      main={
        search.compose && composeAccount ? (
          <Composer
            key={`${search.compose}-${search.email ?? ""}`}
            accountId={composeAccount}
            mode={search.compose}
            sourceEmailId={search.compose === "new" ? undefined : search.email}
            prefillTo={search.to}
          />
        ) : readerAccount ? (
          <SearchReader
            accountId={readerAccount}
            emailId={search.email}
            mailboxes={mailboxes[readerAccount] ?? []}
          />
        ) : null
      }
    />
  );
};

/** The open hit, with the toolbar of the folder it lies in. */
const SearchReader = ({
  accountId,
  emailId,
  mailboxes,
}: {
  accountId: string;
  emailId: string | undefined;
  mailboxes: Mailbox[];
}) => {
  const { data: email } = useEmail(accountId, emailId);
  const mailbox =
    mailboxes.find((candidate) => email?.mailboxIds[candidate.id]) ?? findRole(mailboxes, "inbox");
  return mailbox ? <MessageView accountId={accountId} mailbox={mailbox} emailId={emailId} /> : null;
};

/** One click for the usual filters; they are operators in the search text. */
const SearchChips = ({ q, today }: { q: string; today: string }) => {
  const navigate = useNavigate();
  const tokens = new Set(tokenize(q).map((token) => token.toLowerCase()));
  const month = sinceDays(30, today);
  const chips: [string, () => string][] = [
    ["hat:anhang", m.search_chip_attachment],
    ["ist:ungelesen", m.search_chip_unread],
    ["ist:markiert", m.search_chip_flagged],
    [month, m.search_chip_month],
  ];
  return (
    <nav aria-label="Filter" className="flex flex-wrap gap-1.5">
      {chips.map(([token, label]) => {
        const on = tokens.has(token.toLowerCase());
        return (
          <button
            key={token}
            type="button"
            aria-pressed={on}
            onClick={() =>
              void navigate({
                to: ".",
                search: (prev) => ({ ...prev, q: toggleToken(q, token), email: undefined }),
                replace: true,
              })
            }
            className={cn(
              "h-7 rounded-full border px-3 text-[13px]",
              on ? "border-fg bg-fg text-bg" : "border-border text-muted hover:text-fg",
            )}
          >
            {label()}
          </button>
        );
      })}
    </nav>
  );
};
