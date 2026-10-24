/**
 * The mail app: folders | list | reading pane or composer. On a phone one of them fills the
 * screen at a time, chosen by the URL (folders, email, compose), so the back button works.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import type { Mailbox } from "@/jmap/types";
import { shareStart } from "@/lib/mailto";
import { takeShared } from "@/pwa/share-cache";
import type { MailSearch } from "@/routes/_app/mail.$accountId.$mailboxId";
import { Composer } from "./composer";
import { MailLayout } from "./mail-layout";
import { MailSidebar } from "./mail-sidebar";
import { MessageList } from "./message-list";
import { MessageView } from "./message-view";
import { useMailboxes } from "./queries";
import { SearchPage } from "./search-page";
import { UnifiedPage } from "./unified-page";

/** The URL's account for "Alle Posteingänge". */
export const ALL_INBOXES = "all";

/** The URL names a mailbox by id or, for the standard folders, by role ("inbox"). */
export const resolveMailbox = (
  mailboxes: Mailbox[] | undefined,
  param: string,
): Mailbox | undefined =>
  mailboxes?.find((mailbox) => mailbox.id === param) ??
  mailboxes?.find((mailbox) => mailbox.role === param);

type Props = { accountId: string; mailboxParam: string; search: MailSearch };

export const MailPage = (props: Props) =>
  props.accountId !== ALL_INBOXES ? (
    <FolderPage {...props} />
  ) : props.mailboxParam === "search" ? (
    <SearchPage search={props.search} />
  ) : (
    <UnifiedPage search={props.search} />
  );

/**
 * What another app shared, read once from the service worker's cache (taking it removes it, so
 * the query keeps it for the composer).
 */
const useShared = (id: string | undefined) => {
  const { data, isPending } = useQuery({
    queryKey: ["shared", id],
    queryFn: async () => {
      const item = await takeShared(id!);
      return item ? { ...shareStart(item), files: item.files } : null;
    },
    enabled: Boolean(id),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
  return { shared: data ?? undefined, waiting: Boolean(id) && isPending };
};

const FolderPage = ({ accountId, mailboxParam, search }: Props) => {
  const mailboxes = useMailboxes(accountId);
  const { shared, waiting } = useShared(search.shared);
  const mailbox = resolveMailbox(mailboxes.data, mailboxParam);
  const navigate = useNavigate();

  // A folder that is gone (deleted elsewhere) falls back to the inbox.
  useEffect(() => {
    if (mailboxes.data && !mailbox && mailboxParam !== "inbox") {
      void navigate({
        to: "/mail/$accountId/$mailboxId",
        params: { accountId, mailboxId: "inbox" },
        replace: true,
      });
    }
  }, [mailboxes.data, mailbox, mailboxParam, accountId, navigate]);

  return (
    <MailLayout
      search={search}
      sidebar={<MailSidebar accountId={accountId} mailbox={mailbox} />}
      list={
        mailbox ? <MessageList accountId={accountId} mailbox={mailbox} search={search} /> : null
      }
      main={
        mailbox && search.compose && !waiting ? (
          <Composer
            key={`${search.compose}-${search.email ?? ""}-${search.shared ?? ""}`}
            accountId={accountId}
            mode={search.compose}
            sourceEmailId={search.compose === "new" ? undefined : search.email}
            prefill={{
              to: search.to,
              cc: search.cc,
              subject: search.subject ?? shared?.subject,
              body: search.body ?? shared?.body,
              files: shared?.files,
            }}
          />
        ) : mailbox ? (
          <MessageView accountId={accountId} mailbox={mailbox} emailId={search.email} />
        ) : null
      }
    />
  );
};
