/**
 * Conversations (RFC 8621 §3): JMAP keeps every mail in a thread, across the folders of one
 * account. One round-trip each: the thread's ids, then their summaries by result reference.
 */
import type { JmapClient } from "./client";
import { SUMMARY_PROPERTIES } from "./mail";
import type { EmailSummary } from "./types";

/** The mails of these threads, by thread. */
export const getThreads = async (
  client: JmapClient,
  accountId: string,
  threadIds: string[],
): Promise<Record<string, EmailSummary[]>> => {
  const ids = [...new Set(threadIds)];
  if (!ids.length) return {};
  const [, get] = await client.request([
    ["Thread/get", { accountId, ids }, "t"],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "t", name: "Thread/get", path: "/list/*/emailIds" },
        properties: SUMMARY_PROPERTIES,
      },
      "g",
    ],
  ]);
  const byThread: Record<string, EmailSummary[]> = {};
  for (const mail of (get![1].list as EmailSummary[]) ?? []) {
    byThread[mail.threadId] = [...(byThread[mail.threadId] ?? []), mail];
  }
  return byThread;
};
