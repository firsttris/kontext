/**
 * Tasks from mail rules: a rule with "Aufgabe anlegen" marks the mail in Stalwart (Sieve,
 * TASK_KEYWORD), also with Kontext closed. Every minute the server looks for marked mails in every
 * mailbox someone signed in can write to, makes the task – on that mailbox's board, linked to the
 * mail, in one's own mailbox for its owner – and takes the mark away.
 */
import type { Grants } from "../auth";
import type { Env } from "../env";
import { TASK_KEYWORD } from "../rules/script";
import type { TaskStore } from "./store";
import type { NewTaskData, TaskLink } from "./tasks";

const USING = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"];
/** At most this many marked mails of one mailbox per minute. */
const BATCH = 50;

export type MarkedMail = {
  id: string;
  threadId: string | null;
  subject: string | null;
  from: { name: string | null; email: string }[] | null;
  receivedAt: string;
};

type JmapSession = {
  apiUrl: string;
  primaryAccounts: Record<string, string>;
  accounts: Record<string, { isReadOnly?: boolean; accountCapabilities: Record<string, unknown> }>;
};

/** "AW: Re: Angebot" → "Angebot". */
const plainSubject = (subject: string) =>
  subject.replace(/^(\s*(re|aw|wg|fwd?|antw)\s*:\s*)+/i, "").trim();

const when = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** The task for a marked mail: its subject, linked to it; one's own mail is one's own task. */
export const taskOfMail = (mail: MarkedMail, accountId: string, personal: boolean): NewTaskData => {
  const sender = mail.from?.[0];
  const link: TaskLink = {
    kind: "mail",
    accountId,
    ref: mail.id,
    threadId: mail.threadId,
    label: mail.subject || "(ohne Betreff)",
    detail: [sender?.name || sender?.email, when(mail.receivedAt)].filter(Boolean).join(" · "),
  };
  return {
    accountId,
    title: plainSubject(mail.subject ?? "").slice(0, 300) || "Mail ohne Betreff",
    notes: "",
    status: "open",
    assigneeId: personal ? accountId : null,
    dueDate: null,
    dueTime: null,
    checklist: [],
    links: [link],
    remindAt: null,
    repeat: null,
  };
};

export const createRuleTasks = ({
  env,
  grants,
  sessions,
  store,
  changed = () => undefined,
}: {
  env: Env;
  grants: Pick<Grants, "accessToken">;
  /** The newest sign-in session of every person who has one. */
  sessions: () => Promise<string[]>;
  store: Pick<TaskStore, "create">;
  /** Told of a board that got tasks, for the live connection. */
  changed?: (accountId: string) => void;
}) => {
  const onStalwart = (url: string) => {
    const parsed = new URL(url);
    return `${env.STALWART_URL}${parsed.pathname}${parsed.search}`;
  };

  /** Marked mails of one mailbox become tasks; how many. */
  const sweep = async (
    call: <T>(calls: unknown[]) => Promise<(T | undefined)[]>,
    accountId: string,
    personal: boolean,
  ) => {
    const [, got] = await call<{ list?: MarkedMail[] }>([
      [
        "Email/query",
        {
          accountId,
          filter: { hasKeyword: TASK_KEYWORD },
          sort: [{ property: "receivedAt", isAscending: true }],
          limit: BATCH,
        },
        "q",
      ],
      [
        "Email/get",
        {
          accountId,
          "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
          properties: ["threadId", "subject", "from", "receivedAt"],
        },
        "g",
      ],
    ]);
    let made = 0;
    for (const mail of got?.list ?? []) {
      // The mark goes first: should that fail, no task is made twice next minute.
      const [set] = await call<{ updated?: Record<string, unknown> | null }>([
        [
          "Email/set",
          { accountId, update: { [mail.id]: { [`keywords/${TASK_KEYWORD}`]: null } } },
          "s",
        ],
      ]);
      if (!set?.updated || !(mail.id in set.updated)) continue;
      await store.create(taskOfMail(mail, accountId, personal), accountId);
      made++;
    }
    return made;
  };

  let running = false;
  return {
    tick: async (): Promise<number> => {
      if (running) return 0;
      running = true;
      let made = 0;
      try {
        // A shared mailbox is looked at once, by the first who may write in it.
        const done = new Set<string>();
        for (const sessionId of await sessions()) {
          try {
            const token = await grants.accessToken(sessionId);
            if (!token) continue;
            const auth = { authorization: `Bearer ${token}` };
            const response = await fetch(`${env.STALWART_URL}/jmap/session`, { headers: auth });
            if (!response.ok) continue;
            const session = (await response.json()) as JmapSession;
            const call = async <T>(calls: unknown[]) => {
              const answer = await fetch(onStalwart(session.apiUrl), {
                method: "POST",
                headers: { ...auth, "content-type": "application/json" },
                body: JSON.stringify({ using: USING, methodCalls: calls }),
              });
              if (!answer.ok) throw new Error(`JMAP ${answer.status}`);
              const { methodResponses } = (await answer.json()) as {
                methodResponses: [string, T][];
              };
              return methodResponses.map(([name, result]) =>
                name === "error" ? undefined : result,
              );
            };
            const own = session.primaryAccounts[USING[1]!];
            for (const [accountId, account] of Object.entries(session.accounts)) {
              if (done.has(accountId) || account.isReadOnly) continue;
              if (!(USING[1]! in account.accountCapabilities)) continue;
              done.add(accountId);
              const count = await sweep(call, accountId, accountId === own);
              if (count) changed(accountId);
              made += count;
            }
          } catch (error) {
            console.warn(`Aufgaben aus Regeln: ${(error as Error).message}`);
          }
        }
      } finally {
        running = false;
      }
      return made;
    },
  };
};
