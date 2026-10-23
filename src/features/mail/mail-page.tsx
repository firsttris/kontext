/**
 * The mail app: folders | list | reading pane or composer. On a phone one of them fills the
 * screen at a time, chosen by the URL (folders, email, compose), so the back button works.
 */
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import type { Mailbox } from "@/jmap/types";
import { cn } from "@/lib/cn";
import type { MailSearch } from "@/routes/_app/mail.$accountId.$mailboxId";
import { Composer } from "./composer";
import { MailSidebar } from "./mail-sidebar";
import { MessageList } from "./message-list";
import { MessageView } from "./message-view";
import { useMailboxes } from "./queries";

/** The URL names a mailbox by id or, for the standard folders, by role ("inbox"). */
export const resolveMailbox = (
  mailboxes: Mailbox[] | undefined,
  param: string,
): Mailbox | undefined =>
  mailboxes?.find((mailbox) => mailbox.id === param) ??
  mailboxes?.find((mailbox) => mailbox.role === param);

type Props = { accountId: string; mailboxParam: string; search: MailSearch };

export const MailPage = ({ accountId, mailboxParam, search }: Props) => {
  const mailboxes = useMailboxes(accountId);
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

  const screen = search.folders
    ? "folders"
    : search.compose
      ? "compose"
      : search.email
        ? "reader"
        : "list";

  return (
    <>
      <div
        className={cn(
          "h-full shrink-0 flex-col border-r border-border bg-side",
          screen === "folders" ? "flex w-full md:w-[236px]" : "hidden lg:flex lg:w-[236px]",
        )}
      >
        <MailSidebar accountId={accountId} mailbox={mailbox} />
      </div>
      <section
        aria-label="Nachrichtenliste"
        className={cn(
          "h-full w-full shrink-0 flex-col border-border md:w-[320px] md:border-r xl:w-[370px]",
          screen === "list" ? "flex" : "hidden md:flex",
          screen === "folders" && "md:hidden lg:flex",
        )}
      >
        {mailbox ? <MessageList accountId={accountId} mailbox={mailbox} search={search} /> : null}
      </section>
      <main
        className={cn(
          "h-full min-w-0 flex-1 flex-col",
          screen === "reader" || screen === "compose" ? "flex" : "hidden md:flex",
        )}
      >
        {mailbox && search.compose ? (
          <Composer
            key={`${search.compose}-${search.email ?? ""}`}
            accountId={accountId}
            mode={search.compose}
            sourceEmailId={search.compose === "new" ? undefined : search.email}
            prefillTo={search.to}
          />
        ) : mailbox ? (
          <MessageView accountId={accountId} mailbox={mailbox} emailId={search.email} />
        ) : null}
      </main>
    </>
  );
};
