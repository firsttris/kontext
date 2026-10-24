/**
 * The conversation around the mail being read, without changing the list: above it the earlier
 * mails (folded, one line each when opened), below it the answers that came since. A line leads
 * to that mail. In a shared mailbox the answers of colleagues are there too (its Sent folder).
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, CornerDownRight } from "lucide-react";
import { useState } from "react";
import { useClient } from "@/auth/auth";
import { Avatar } from "@/components/ui/avatar";
import { getThreads } from "@/jmap/threads";
import type { EmailSummary } from "@/jmap/types";
import { cn } from "@/lib/cn";
import { aroundMail, personOf } from "@/lib/conversation";
import { displayName, listDate } from "@/lib/format";
import { findRole } from "@/lib/mailboxes";
import { m } from "@/paraglide/messages";
import { useMailboxes } from "./queries";

export const useThread = (accountId: string, threadId: string | undefined) => {
  const client = useClient();
  return useQuery({
    queryKey: [accountId, "thread", threadId],
    queryFn: async () => (await getThreads(client, accountId, [threadId!]))[threadId!] ?? [],
    enabled: Boolean(threadId),
  }).data;
};

/** The earlier and later mails of the conversation, without trash, spam and drafts. */
export const useConversation = (accountId: string, email: EmailSummary) => {
  const thread = useThread(accountId, email.threadId);
  const { data: mailboxes = [] } = useMailboxes(accountId);
  const hidden = [findRole(mailboxes, "trash")?.id, findRole(mailboxes, "junk")?.id].filter(
    (id): id is string => Boolean(id),
  );
  const sent = findRole(mailboxes, "sent")?.id;
  return { ...aroundMail(thread ?? [], email, hidden), sent };
};

const Line = ({
  mail,
  sent,
  later = false,
}: {
  mail: EmailSummary;
  sent: string | undefined;
  later?: boolean;
}) => {
  // An answer from a shared mailbox names the colleague: "Jonas Weber", not "(Allgemeine Anfragen)".
  const name = personOf(displayName(mail.from?.[0]));
  const ownAnswer = Boolean(sent && mail.mailboxIds[sent]);
  return (
    <Link
      to="."
      search={(prev) => ({ ...prev, email: mail.id, compose: undefined })}
      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-fg no-underline hover:bg-hover"
    >
      {later ? (
        <CornerDownRight size={14} className="shrink-0 text-muted" aria-hidden="true" />
      ) : null}
      <Avatar name={name} size={22} />
      <span className="flex min-w-0 flex-1 items-baseline gap-2 text-[13px]">
        <span className="shrink-0 font-medium">{name}</span>
        {ownAnswer ? (
          <span className="shrink-0 rounded bg-subtle px-1 text-[11px] text-muted">
            {m.mail_thread_sent()}
          </span>
        ) : null}
        <span className="min-w-0 truncate text-muted">{mail.preview}</span>
      </span>
      <span className="shrink-0 font-mono text-[12px] text-muted">
        {listDate(mail.receivedAt, new Date())}
      </span>
    </Link>
  );
};

/** Above the mail: "3 frühere Nachrichten in dieser Unterhaltung", opened on a click. */
export const EarlierMails = ({ accountId, email }: { accountId: string; email: EmailSummary }) => {
  const { earlier, sent } = useConversation(accountId, email);
  const [open, setOpen] = useState(false);
  if (!earlier.length) return null;
  return (
    <section aria-label={m.mail_thread_earlier_label()} className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 self-start rounded-lg px-2 py-1 text-[13px] text-muted hover:bg-hover hover:text-fg"
      >
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={cn("transition-transform", open && "rotate-90")}
        />
        {earlier.length === 1
          ? m.mail_thread_earlier_one()
          : m.mail_thread_earlier({ count: earlier.length })}
      </button>
      {open ? earlier.map((mail) => <Line key={mail.id} mail={mail} sent={sent} />) : null}
    </section>
  );
};

/** Below the mail: the answers since, so one sees at once whether it is done. */
export const LaterMails = ({ accountId, email }: { accountId: string; email: EmailSummary }) => {
  const { later, sent } = useConversation(accountId, email);
  if (!later.length) return null;
  return (
    <section
      aria-label={m.mail_thread_later_label()}
      className="flex flex-col gap-0.5 rounded-xl border border-border p-1.5"
    >
      <span className="px-2 pt-0.5 text-[12px] font-medium text-muted">
        {later.length === 1
          ? m.mail_thread_later_one()
          : m.mail_thread_later({ count: later.length })}
      </span>
      {later.map((mail) => (
        <Line key={mail.id} mail={mail} sent={sent} later />
      ))}
    </section>
  );
};
