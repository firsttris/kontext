/**
 * Brings Wiedervorlagen back when they are due, also with Kontext closed: every minute, with the
 * token of a sign-in session that can write in the mailbox – of who put the mail away, else of a
 * colleague – and tells who put it away by push.
 */
import type { Grants } from "../auth";
import type { Env } from "../env";
import type { Notice } from "../push/pusher";
import { type Call, type Snooze, wake } from "./snooze";
import type { SnoozeStore } from "./store";

const USING = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"];

type JmapSession = {
  apiUrl: string;
  accounts: Record<string, { isReadOnly?: boolean }>;
};

/** The notification for a mail that is back. */
export const backNotice = (
  snooze: Snooze,
  mail: { subject: string | null; from: { name: string | null; email: string }[] },
): Notice => ({
  title: `Wiedervorlage: ${mail.from[0]?.name || mail.from[0]?.email || "Mail"}`,
  body: mail.subject ?? "",
  url: `/mail/${encodeURIComponent(snooze.accountId)}/inbox?email=${encodeURIComponent(snooze.emailId)}`,
  tag: `mail-${snooze.emailId}`,
});

export const createSnoozeWaker = ({
  env,
  grants,
  store,
  notify,
  now = () => new Date(),
}: {
  env: Env;
  grants: Pick<Grants, "accessToken">;
  store: Pick<SnoozeStore, "due" | "remove" | "sessionsFor">;
  notify: (memberIds: string[], notice: Notice) => Promise<void>;
  now?: () => Date;
}) => {
  const onStalwart = (url: string) => {
    const parsed = new URL(url);
    return `${env.STALWART_URL}${parsed.pathname}${parsed.search}`;
  };

  /** JMAP calls in this account with the session's token, if it may write there. */
  const callerFor = async (sessionId: string, accountId: string): Promise<Call | null> => {
    const token = await grants.accessToken(sessionId);
    if (!token) return null;
    const auth = { authorization: `Bearer ${token}` };
    const response = await fetch(`${env.STALWART_URL}/jmap/session`, { headers: auth });
    if (!response.ok) return null;
    const session = (await response.json()) as JmapSession;
    const account = session.accounts[accountId];
    if (!account || account.isReadOnly) return null;
    return async <T>(calls: unknown[]) => {
      const answer = await fetch(onStalwart(session.apiUrl), {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ using: USING, methodCalls: calls }),
      });
      if (!answer.ok) throw new Error(`JMAP ${answer.status}`);
      const { methodResponses } = (await answer.json()) as { methodResponses: [string, T][] };
      return methodResponses.map(([name, result]) => (name === "error" ? undefined : result));
    };
  };

  const wakeOne = async (snooze: Snooze & { userId: string }) => {
    for (const sessionId of await store.sessionsFor(snooze.userId)) {
      const call = await callerFor(sessionId, snooze.accountId).catch(() => null);
      if (!call) continue;
      const mail = await wake(call, snooze);
      await store.remove(snooze.accountId, [snooze.emailId]);
      if (mail) await notify([snooze.by], backNotice(snooze, mail));
      return;
    }
    // Nobody signed in who may write there: it stays due and is tried again next time.
  };

  let running = false;
  return {
    /** Everything due; a tick still at work skips the next. */
    tick: async () => {
      if (running) return;
      running = true;
      try {
        for (const snooze of await store.due(now())) {
          await wakeOne(snooze).catch((error: Error) =>
            console.warn(`Wiedervorlage ${snooze.emailId}: ${error.message}`),
          );
        }
      } finally {
        running = false;
      }
    },
  };
};
