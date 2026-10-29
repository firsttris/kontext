/**
 * What the list shows of the conversations of its mails: who answered a mail and when (from the
 * Sent folder, for mails marked $answered, RFC 8621), and – when grouped – how many mails a
 * conversation has, who took part and whether any is unread. One request per mailbox.
 */
import { useQueries } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { getThreads } from "@/jmap/threads";
import type { EmailSummary } from "@/jmap/types";
import { answeredBy, aroundMail, personOf } from "@/lib/conversation";
import { displayName } from "@/lib/format";
import { findRole } from "@/lib/mailboxes";
import { pickKey } from "@/lib/selection";
import type { Row } from "./list-frame";
import { useAllMailboxes } from "./queries";

export type Answer = { name: string; at: string } | null;
/**
 * A conversation as one line: how many mails, who wrote them (oldest first), anything unread and
 * which of its mails those are (marking the line read marks them).
 */
export type Group = { count: number; names: string[]; unread: boolean; unreadIds: string[] };

export const useThreadInfo = (rows: Row[], accountOf: (row: Row) => string, grouped: boolean) => {
  const client = useClient();
  const mailboxes = useAllMailboxes();
  const wanted = grouped ? rows : rows.filter((row) => row.email.keywords.$answered);
  const byAccount = new Map<string, Row[]>();
  for (const row of wanted) {
    byAccount.set(accountOf(row), [...(byAccount.get(accountOf(row)) ?? []), row]);
  }
  const accounts = [...byAccount.keys()];
  const results = useQueries({
    queries: accounts.map((accountId) => {
      const threadIds = [
        ...new Set(byAccount.get(accountId)!.map((row) => row.email.threadId)),
      ].sort();
      return {
        queryKey: [accountId, "threads", threadIds],
        queryFn: () => getThreads(client, accountId, threadIds),
        staleTime: 60_000,
      };
    }),
  });
  const answers = new Map<string, Answer>();
  const groups = new Map<string, Group>();
  accounts.forEach((accountId, index) => {
    const threads = results[index]?.data;
    if (!threads) return;
    const list = mailboxes[accountId] ?? [];
    const sent = findRole(list, "sent")?.id;
    const hidden = [findRole(list, "trash")?.id, findRole(list, "junk")?.id].filter(
      (id): id is string => Boolean(id),
    );
    for (const row of byAccount.get(accountId)!) {
      const key = pickKey(accountId, row.email.id);
      const thread = threads[row.email.threadId] ?? [];
      if (row.email.keywords.$answered) answers.set(key, answeredBy(thread, row.email, sent));
      if (!grouped) continue;
      const { earlier, later } = aroundMail(thread, row.email, hidden);
      const all: EmailSummary[] = [...earlier, row.email, ...later];
      const unreadIds = all
        .filter((mail) => !mail.keywords.$seen && !(sent && mail.mailboxIds[sent]))
        .map((mail) => mail.id);
      groups.set(key, {
        count: all.length,
        names: [...new Set(all.map((mail) => personOf(displayName(mail.from?.[0]))))],
        unread: unreadIds.length > 0,
        unreadIds,
      });
    }
  });
  return { answers, groups };
};
