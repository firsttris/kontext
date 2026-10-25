/**
 * Reading Kontext for an agent, across every account the key's owner sees in their JMAP session
 * (own mailbox, shared mailboxes, what colleagues handed over). Built on the app's own JMAP
 * functions (src/jmap/), so the agent sees the same as the app: what Stalwart allows, nothing
 * more.
 */

import { queryEvents } from "@/jmap/calendar";
import { CAPABILITIES, type JmapClient, type Session } from "@/jmap/client";
import { listAddressBooks, listContacts } from "@/jmap/contacts";
import { getEmail, listMailboxes, SUMMARY_PROPERTIES } from "@/jmap/mail";
import { getThreads } from "@/jmap/threads";
import type { EmailSummary } from "@/jmap/types";
import { dateKey } from "@/lib/jscalendar";
import { parseSearch, toEmailFilter } from "@/lib/mail-search";
import { mailboxPath } from "@/lib/mailboxes";
import type { Task } from "../tasks/tasks";
import {
  type AccountNames,
  contactMatches,
  contactSummary,
  eventSummary,
  mailDetail,
  mailSummary,
  newestFirst,
  taskSummary,
} from "./format";

export type ReaderDeps = {
  client: JmapClient;
  /** Open tasks of these boards, those given to `me`, and the ones finished lately. */
  tasks: (accountIds: string[], me: string | undefined) => Promise<Task[]>;
  now?: () => Date;
};

export type AccountInfo = {
  id: string;
  name: string;
  personal: boolean;
  readOnly: boolean;
  mail: boolean;
  calendars: boolean;
  contacts: boolean;
};

export const accountsOf = (session: Session): AccountInfo[] =>
  Object.entries(session.accounts).map(([id, account]) => ({
    id,
    name: account.name,
    personal: account.isPersonal,
    readOnly: account.isReadOnly,
    mail: CAPABILITIES.mail in account.accountCapabilities,
    calendars: CAPABILITIES.calendars in account.accountCapabilities,
    contacts: CAPABILITIES.contacts in account.accountCapabilities,
  }));

/** An account to ask, or all that have the capability; an unknown id is a mistake to report. */
const pick = (accounts: AccountInfo[], has: keyof AccountInfo, accountId?: string) => {
  const usable = accounts.filter((account) => account[has]);
  if (!accountId) return usable;
  const found = usable.filter((account) => account.id === accountId);
  if (!found.length) throw new Error(`Unbekanntes Konto: ${accountId}`);
  return found;
};

/** One answer per account, side by side; an account that fails is left out, not the whole call. */
const perAccount = async <T>(accounts: AccountInfo[], read: (a: AccountInfo) => Promise<T[]>) =>
  (await Promise.allSettled(accounts.map(read))).flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

export const createReader = ({ client, tasks, now = () => new Date() }: ReaderDeps) => {
  const accounts = async () => accountsOf(await client.getSession());
  const namesOf = (list: AccountInfo[]): AccountNames =>
    Object.fromEntries(list.map((account) => [account.id, account.name]));

  const contacts = async (query: string, limit: number, accountId?: string) => {
    const list = await accounts();
    const names = namesOf(list);
    const found = await perAccount(pick(list, "contacts", accountId), async (account) => {
      const books = await listAddressBooks(client, account.id);
      const cards = (await Promise.all(books.map((b) => listContacts(client, account.id, b.id))))
        .flat()
        .filter((card) => contactMatches(card, query));
      return cards.map((card) => contactSummary(card, account.id, names));
    });
    // A card in two books of one account comes once.
    const unique = [...new Map(found.map((c) => [`${c.accountId}/${c.id}`, c])).values()];
    return unique.slice(0, limit);
  };

  /** Mails matching a JMAP filter, the newest `limit` across the accounts. */
  const mailsWhere = async (
    list: AccountInfo[],
    filterFor: (account: AccountInfo) => Promise<Record<string, unknown> | null>,
    limit: number,
  ) => {
    const names = namesOf(list);
    const found = await perAccount(list, async (account) => {
      const filter = await filterFor(account);
      if (!filter) return [];
      const [, get] = await client.request([
        [
          "Email/query",
          {
            accountId: account.id,
            filter,
            sort: [{ property: "receivedAt", isAscending: false }],
            limit,
          },
          "q",
        ],
        [
          "Email/get",
          {
            accountId: account.id,
            "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
            properties: SUMMARY_PROPERTIES,
          },
          "g",
        ],
      ]);
      return ((get![1].list as EmailSummary[]) ?? []).map((e) => mailSummary(e, account.id, names));
    });
    return newestFirst(found).slice(0, limit);
  };

  /** The search box's language (`von:`, `betreff:`, `nach:`, `ist:ungelesen`, `in:info@` …). */
  const searchMail = async (query: string, limit: number, accountId?: string) => {
    const list = pick(await accounts(), "mail", accountId);
    const parsed = parseSearch(query, dateKey(now()));
    return mailsWhere(
      list,
      async (account) => {
        const mailboxes = await listMailboxes(client, account.id);
        return toEmailFilter(parsed, {
          label: account.name,
          isPersonal: account.personal,
          mailboxes,
          path: (mailbox) => mailboxPath(mailbox, mailboxes),
          // Categories live on the Kontext server; `kategorie:` is not offered to agents yet.
          categories: [],
        });
      },
      limit,
    );
  };

  /** Mails from, to or copied to any of these addresses (or parts of them, like "@firma.de"). */
  const mailsWith = async (addresses: string[], limit: number) => {
    if (!addresses.length) return [];
    const filter = {
      operator: "OR",
      conditions: addresses.flatMap((address) => [
        { from: address },
        { to: address },
        { cc: address },
      ]),
    };
    return mailsWhere(pick(await accounts(), "mail"), async () => filter, limit);
  };

  const readMail = async (accountId: string, emailId: string, maxChars: number) => {
    const list = await accounts();
    pick(list, "mail", accountId);
    const [email, mailboxes] = await Promise.all([
      getEmail(client, accountId, emailId),
      listMailboxes(client, accountId),
    ]);
    if (!email) throw new Error(`Mail nicht gefunden: ${emailId}`);
    const folders = mailboxes
      .filter((mailbox) => email.mailboxIds[mailbox.id])
      .map((mailbox) => mailboxPath(mailbox, mailboxes));
    return mailDetail(email, accountId, namesOf(list), folders, maxChars);
  };

  const readThread = async (accountId: string, threadId: string) => {
    const list = await accounts();
    pick(list, "mail", accountId);
    const mails = (await getThreads(client, accountId, [threadId]))[threadId] ?? [];
    const names = namesOf(list);
    // Oldest first: a conversation reads from the top.
    return newestFirst(mails.map((e) => mailSummary(e, accountId, names))).reverse();
  };

  const events = async (after: Date, before: Date, text?: string, accountId?: string) => {
    const list = await accounts();
    const names = namesOf(list);
    const found = await perAccount(pick(list, "calendars", accountId), async (account) =>
      (await queryEvents(client, account.id, after, before, text ? { text } : {})).map((event) => ({
        raw: event,
        summary: eventSummary(event, account.id, names),
      })),
    );
    return found.sort((a, b) => a.summary.start.localeCompare(b.summary.start));
  };

  const taskList = async () => {
    const list = await accounts();
    const me = list.find((account) => account.personal)?.id;
    const all = await tasks(
      list.map((account) => account.id),
      me,
    );
    return { all, summarize: (task: Task) => taskSummary(task, namesOf(list)) };
  };

  return { accounts, contacts, searchMail, mailsWith, readMail, readThread, events, taskList };
};

export type Reader = ReturnType<typeof createReader>;
