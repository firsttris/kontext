/**
 * New mail on the phone, also with Kontext closed: for everyone with a push subscription the
 * server listens to Stalwart's JMAP event stream (with the token of their newest session) and,
 * when an inbox changed, sends the new unread mails as notifications. The same `tag` as the
 * app's own notifications (features/notifications) keeps one mail from showing twice.
 */
import type { Grants } from "../auth";
import type { Env } from "../env";
import { fillTemplate, parseEvents } from "../jmap";
import type { Notice, Pusher } from "./pusher";
import type { PushStore } from "./store";

export type NewMail = {
  id: string;
  subject: string | null;
  from: { name: string | null; email: string }[] | null;
  receivedAt: string;
  keywords: Record<string, boolean>;
};

/** More new mails at once than this become one notification. */
const SINGLE_NOTICES = 3;

/** The notifications for the mails of one inbox that came after `since` and are unread. */
export const mailNotices = (mails: NewMail[], accountId: string, since: string): Notice[] => {
  const fresh = mails
    .filter((mail) => Date.parse(mail.receivedAt) > Date.parse(since) && !mail.keywords.$seen)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const url = (id?: string) =>
    `/mail/${encodeURIComponent(accountId)}/inbox${id ? `?email=${encodeURIComponent(id)}` : ""}`;
  if (fresh.length > SINGLE_NOTICES) {
    return [
      { title: `${fresh.length} neue Mails`, body: "", url: url(), tag: `mail-${accountId}` },
    ];
  }
  return fresh.map((mail) => ({
    title: `Neue Mail von ${mail.from?.[0]?.name || mail.from?.[0]?.email || "Unbekannt"}`,
    body: mail.subject ?? "",
    url: url(mail.id),
    tag: `mail-${mail.id}`,
  }));
};

type Watch = { sessionId: string; stop: AbortController };

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

const USING = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"];
/** A reconnect now and then picks up a fresh token and changed access. */
const RECONNECT_MS = 15 * 60_000;
const RETRY_MS = 30_000;

export const createMailWatch = ({
  env,
  grants,
  store,
  pusher,
}: {
  env: Env;
  grants: Grants;
  store: Pick<PushStore, "subscribers" | "mailboxesOff">;
  pusher: Pusher;
}) => {
  const watches = new Map<string, Watch>();
  const onStalwart = (url: string) => {
    const parsed = new URL(url);
    return `${env.STALWART_URL}${parsed.pathname}${parsed.search}`;
  };

  /** One person's inboxes, told of what arrives after `since` (per account). */
  const watch = async (memberId: string, sessionId: string, signal: AbortSignal) => {
    // From when on mail is news: the start of watching. A JMAP UTCDate has whole seconds
    // (RFC 8620 §1.4), so a second earlier, or a mail of that very second would count as old;
    // one told twice shows once (same tag).
    const started = new Date(Date.now() - 1000).toISOString().replace(/\.\d+Z$/, "Z");
    const since = new Map<string, string>();
    while (!signal.aborted) {
      try {
        const token = await grants.accessToken(sessionId);
        if (!token) throw new Error("no token");
        const auth = { authorization: `Bearer ${token}` };
        const session = (await (
          await fetch(`${env.STALWART_URL}/jmap/session`, { headers: auth, signal })
        ).json()) as {
          apiUrl: string;
          eventSourceUrl: string;
          accounts: Record<string, { accountCapabilities: Record<string, unknown> }>;
        };
        const call = async <T>(calls: unknown[]): Promise<(T | undefined)[]> => {
          const response = await fetch(onStalwart(session.apiUrl), {
            method: "POST",
            headers: { ...auth, "content-type": "application/json" },
            body: JSON.stringify({ using: USING, methodCalls: calls }),
            signal,
          });
          const { methodResponses } = (await response.json()) as {
            methodResponses: [string, T][];
          };
          // A method error (an account shared without the right to look) answers nothing.
          return methodResponses.map(([name, result]) => (name === "error" ? undefined : result));
        };
        const mailAccounts = Object.entries(session.accounts)
          .filter(([, account]) => USING[1]! in account.accountCapabilities)
          .map(([id]) => id);
        const inboxes = new Map<string, string>();
        for (const accountId of mailAccounts) {
          const [query] = await call<{ ids: string[] }>([
            ["Mailbox/query", { accountId, filter: { role: "inbox" } }, "q"],
          ]);
          const inbox = query?.ids?.[0];
          if (inbox) inboxes.set(accountId, inbox);
          if (!since.has(accountId)) since.set(accountId, started);
        }

        const check = async (accountId: string) => {
          const inbox = inboxes.get(accountId);
          const after = since.get(accountId);
          if (!inbox || !after) return;
          // Switched off for this mailbox: nothing is told, and nothing piles up for later.
          if ((await store.mailboxesOff(memberId)).includes(accountId)) {
            since.set(accountId, new Date().toISOString().replace(/\.\d+Z$/, "Z"));
            return;
          }
          const [, got] = await call<{ list?: NewMail[] }>([
            [
              "Email/query",
              {
                accountId,
                filter: { inMailbox: inbox, after },
                sort: [{ property: "receivedAt", isAscending: false }],
                limit: 10,
              },
              "q",
            ],
            [
              "Email/get",
              {
                accountId,
                "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
                properties: ["subject", "from", "receivedAt", "keywords"],
              },
              "g",
            ],
          ]);
          const mails = got?.list ?? [];
          const latest = mails
            .map((mail) => mail.receivedAt)
            .sort()
            .at(-1);
          if (latest && latest > after) since.set(accountId, latest);
          for (const notice of mailNotices(mails, accountId, after)) {
            await pusher.notify([memberId], notice);
          }
        };

        const url = onStalwart(
          fillTemplate(session.eventSourceUrl, { types: "Email", closeafter: "no", ping: "60" }),
        );
        const reconnect = AbortSignal.any([signal, AbortSignal.timeout(RECONNECT_MS)]);
        const response = await fetch(url, {
          headers: { ...auth, accept: "text/event-stream" },
          signal: reconnect,
        });
        if (!response.ok || !response.body) throw new Error(`event stream ${response.status}`);
        // With the stream up, what came before it: since the start, or while it was down.
        for (const accountId of inboxes.keys()) await check(accountId);
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const parsed = parseEvents(buffer + value);
          buffer = parsed.rest;
          for (const event of parsed.events) {
            if (event.type !== "state") continue;
            const { changed } = JSON.parse(event.data) as {
              changed: Record<string, Record<string, string>>;
            };
            for (const [accountId, types] of Object.entries(changed)) {
              if ("Email" in types) await check(accountId);
            }
          }
        }
      } catch (error) {
        if (signal.aborted) return;
        // The planned reconnect goes on at once; after a failure (session gone, Stalwart
        // restarting) it waits a little.
        if ((error as Error).name !== "TimeoutError") {
          console.warn(`Mail-Push für ${memberId}: ${(error as Error).message}`);
          await sleep(RETRY_MS, signal);
        }
      }
    }
  };

  /** Watches who has a subscription now, and stops for who has none any more. */
  const refresh = async () => {
    const wanted = await store.subscribers();
    for (const [memberId, current] of watches) {
      const still = wanted.find((w) => w.memberId === memberId);
      if (!still || still.sessionId !== current.sessionId) {
        current.stop.abort();
        watches.delete(memberId);
      }
    }
    for (const { memberId, sessionId } of wanted) {
      if (watches.has(memberId)) continue;
      const stop = new AbortController();
      watches.set(memberId, { sessionId, stop });
      void watch(memberId, sessionId, stop.signal);
    }
  };

  return {
    refresh,
    stop: () => {
      for (const { stop } of watches.values()) stop.abort();
      watches.clear();
    },
  };
};
