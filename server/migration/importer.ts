/**
 * Writing moved data into one Stalwart account with the server's key (needs `impersonate`, see
 * server/company/mailstore.ts): mails with Email/import (RFC 8621 §4.8), contacts with
 * ContactCard/parse and appointments with CalendarEvent/parse, then /set. Blobs go inline with
 * Blob/upload (RFC 9404) where they fit into one request (Stalwart: 10 MB per request).
 */
import type { CategoryStore } from "../categories/store";
import type { StalwartRequest, StalwartUpload } from "../company/management";
import { resolveCategories, type SourceCategory } from "./categories";

const CORE = "urn:ietf:params:jmap:core";
const BLOB = "urn:ietf:params:jmap:blob";
const MAIL = [CORE, "urn:ietf:params:jmap:mail", BLOB];
const CONTACTS = [
  CORE,
  "urn:ietf:params:jmap:contacts",
  "urn:ietf:params:jmap:contacts:parse",
  BLOB,
];
const CALENDARS = [
  CORE,
  "urn:ietf:params:jmap:calendars",
  "urn:ietf:params:jmap:calendars:parse",
  BLOB,
];

/** Mails up to this size go inline (base64 grows by a third); larger ones are uploaded alone. */
export const INLINE_LIMIT = 6_000_000;
const PAGE = 500;

export type Folder = { id: string; name: string; parentId: string | null; role: string | null };
export type MailToImport = {
  raw: Uint8Array;
  mailboxId: string;
  /** JMAP keywords such as $seen and $flagged. */
  keywords: Record<string, true>;
  receivedAt: string | null;
  /** Categories of the old mailbox, by name; they become keywords of the account's categories. */
  categories?: SourceCategory[];
};
export type Outcome = { imported: number; failed: string[] };
/** Per mail of a batch the new email id, or null when Stalwart refused it. */
export type MailOutcome = Outcome & { ids: (string | null)[] };

type Response = Record<string, unknown>;

const failures = (result: Response, key: string): string[] =>
  Object.values((result[key] ?? {}) as Record<string, { type: string; description?: string }>).map(
    (error) => error.description ?? error.type,
  );

const base64 = (data: Uint8Array | string) =>
  Buffer.from(typeof data === "string" ? new TextEncoder().encode(data) : data).toString("base64");

export const createImporter = (
  request: StalwartRequest,
  upload: StalwartUpload,
  /** Without it, categories of the old mailbox are left out. */
  categoryStore?: CategoryStore,
) => {
  /** The batch's categories as keywords; categories the account lacks are added first. */
  const withCategories = async (
    accountId: string,
    mails: MailToImport[],
  ): Promise<MailToImport[]> => {
    const wanted = mails.flatMap((mail) => mail.categories ?? []);
    if (!categoryStore || !wanted.length) return mails;
    const existing = (await categoryStore.list([accountId]))[accountId] ?? [];
    const { categories, keywords } = resolveCategories(existing, wanted);
    if (categories.length !== existing.length) await categoryStore.save(accountId, categories);
    return mails.map((mail) => ({
      ...mail,
      keywords: {
        ...mail.keywords,
        ...Object.fromEntries(
          (mail.categories ?? []).flatMap((category) => {
            const keyword = keywords.get(category.name.trim().toLowerCase());
            return keyword ? [[keyword, true as const]] : [];
          }),
        ),
      },
    }));
  };

  /** Some properties (and the id) of all objects a query finds, page by page. */
  const collect = async (
    accountId: string,
    method: "Email" | "ContactCard" | "CalendarEvent",
    properties: string[],
    using: string[],
    filter?: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> => {
    const values: Record<string, unknown>[] = [];
    for (let position = 0; ; position += PAGE) {
      const [query, get] = await request(
        [
          [
            `${method}/query`,
            { accountId, position, limit: PAGE, ...(filter ? { filter } : {}) },
            "q",
          ],
          [
            `${method}/get`,
            {
              accountId,
              "#ids": { resultOf: "q", name: `${method}/query`, path: "/ids" },
              properties,
            },
            "g",
          ],
        ],
        using,
      );
      const list = (get![1].list ?? []) as Record<string, unknown>[];
      values.push(...list);
      if ((query![1].ids as string[]).length < PAGE) return values;
    }
  };

  /**
   * Message-ID → email id of the mails already in the account, against duplicates; with `after`
   * only those received since then (RFC 8621 §4.4.1), for a few new mails instead of the whole
   * account. A Message-ID search would need Stalwart's header index, which is off by default.
   */
  const knownMessageIds = async (accountId: string, after?: Date): Promise<Map<string, string>> => {
    const known = new Map<string, string>();
    const filter = after ? { after: after.toISOString().replace(/\.\d{3}Z$/, "Z") } : undefined;
    for (const email of await collect(accountId, "Email", ["messageId"], MAIL, filter)) {
      for (const messageId of (email.messageId as string[] | null) ?? []) {
        known.set(messageId, email.id as string);
      }
    }
    return known;
  };

  /** Puts mails that are already there into one more folder (a second Gmail label). */
  const addToFolders = async (accountId: string, folderOf: Record<string, string>) => {
    const ids = Object.keys(folderOf);
    if (!ids.length) return;
    await request(
      [
        [
          "Email/set",
          {
            accountId,
            update: Object.fromEntries(
              ids.map((id) => [id, { [`mailboxIds/${folderOf[id]}`]: true }]),
            ),
          },
          "0",
        ],
      ],
      MAIL,
    );
  };

  const folders = async (accountId: string): Promise<Folder[]> => {
    const [[, result]] = (await request(
      [["Mailbox/get", { accountId, properties: ["name", "parentId", "role"] }, "0"]],
      MAIL,
    )) as [[string, Response, string]];
    return result.list as Folder[];
  };

  const createFolder = async (
    accountId: string,
    name: string,
    parentId: string | null,
    role: string | null = null,
  ): Promise<string> => {
    const [[, result]] = (await request(
      [
        [
          "Mailbox/set",
          { accountId, create: { f: { name, parentId, ...(role ? { role } : {}) } } },
          "0",
        ],
      ],
      MAIL,
    )) as [[string, Response, string]];
    const id = (result.created as Record<string, { id: string }> | undefined)?.f?.id;
    if (!id) throw new Error(`Ordner ${name}: ${failures(result, "notCreated")[0] ?? "Fehler"}`);
    return id;
  };

  const importArgs = (mail: MailToImport, blobId: string) => ({
    blobId,
    mailboxIds: { [mail.mailboxId]: true },
    keywords: mail.keywords,
    ...(mail.receivedAt ? { receivedAt: mail.receivedAt } : {}),
  });

  /** One batch of small mails in one request; a large mail alone through the upload. */
  const importMails = async (accountId: string, given: MailToImport[]): Promise<MailOutcome> => {
    const mails = await withCategories(accountId, given);
    if (mails.length === 1 && mails[0]!.raw.length > INLINE_LIMIT) {
      const mail = mails[0]!;
      const blobId = await upload(accountId, mail.raw, "message/rfc822").catch(() => null);
      if (!blobId) return { imported: 0, failed: ["Mail zu groß zum Hochladen"], ids: [null] };
      const [[, result]] = (await request(
        [["Email/import", { accountId, emails: { e: importArgs(mail, blobId) } }, "0"]],
        MAIL,
      )) as [[string, Response, string]];
      const created = result.created as Record<string, { id: string }> | undefined;
      return {
        imported: created?.e ? 1 : 0,
        failed: failures(result, "notCreated"),
        ids: [created?.e?.id ?? null],
      };
    }
    const [, imported] = await request(
      [
        [
          "Blob/upload",
          {
            accountId,
            create: Object.fromEntries(
              mails.map((mail, i) => [
                `b${i}`,
                { data: [{ "data:asBase64": base64(mail.raw) }], type: "message/rfc822" },
              ]),
            ),
          },
          "u",
        ],
        [
          "Email/import",
          {
            accountId,
            emails: Object.fromEntries(
              mails.map((mail, i) => [`e${i}`, importArgs(mail, `#b${i}`)]),
            ),
          },
          "i",
        ],
      ],
      MAIL,
    );
    const result = imported![1];
    const created = (result.created ?? {}) as Record<string, { id: string }>;
    return {
      imported: Object.keys(created).length,
      failed: failures(result, "notCreated"),
      ids: mails.map((_, i) => created[`e${i}`]?.id ?? null),
    };
  };

  /** Parses files (vCard or iCalendar) in Stalwart; per file the parsed objects. */
  const parse = async (
    accountId: string,
    method: "ContactCard/parse" | "CalendarEvent/parse",
    type: string,
    texts: string[],
    using: string[],
  ): Promise<unknown[][]> => {
    const [uploaded, parsed] = await request(
      [
        [
          "Blob/upload",
          {
            accountId,
            create: Object.fromEntries(
              texts.map((text, i) => [`b${i}`, { data: [{ "data:asText": text }], type }]),
            ),
          },
          "u",
        ],
        [method, { accountId, blobIds: texts.map((_, i) => `#b${i}`) }, "p"],
      ],
      using,
    );
    const blobs = (uploaded![1].created ?? {}) as Record<string, { id: string }>;
    const results = (parsed![1].parsed ?? {}) as Record<string, unknown>;
    return texts.map((_, i) => {
      const value = results[blobs[`b${i}`]?.id ?? ""];
      return value === undefined ? [] : Array.isArray(value) ? value : [value];
    });
  };

  const defaultId = async (accountId: string, method: string, using: string[]) => {
    const [[, result]] = (await request(
      [[method, { accountId, properties: ["isDefault"] }, "0"]],
      using,
    )) as [[string, Response, string]];
    const list = result.list as { id: string; isDefault?: boolean }[];
    const found = list.find((item) => item.isDefault) ?? list[0];
    if (!found) throw new Error(`${method}: nichts gefunden`);
    return found.id;
  };

  const create = async (
    accountId: string,
    method: "ContactCard/set" | "CalendarEvent/set",
    objects: Record<string, unknown>[],
    using: string[],
  ): Promise<Outcome> => {
    if (!objects.length) return { imported: 0, failed: [] };
    const [[, result]] = (await request(
      [
        [
          method,
          { accountId, create: Object.fromEntries(objects.map((o, i) => [`c${i}`, o])) },
          "0",
        ],
      ],
      using,
    )) as [[string, Response, string]];
    return {
      imported: Object.keys(result.created ?? {}).length,
      failed: failures(result, "notCreated"),
    };
  };

  return {
    knownMessageIds,
    addToFolders,
    folders,
    createFolder,
    importMails,
    contacts: {
      known: (accountId: string) => collect(accountId, "ContactCard", ["name", "emails"], CONTACTS),
      parse: (accountId: string, texts: string[]) =>
        parse(accountId, "ContactCard/parse", "text/vcard", texts, CONTACTS),
      defaultBook: (accountId: string) => defaultId(accountId, "AddressBook/get", CONTACTS),
      create: (accountId: string, cards: Record<string, unknown>[]) =>
        create(accountId, "ContactCard/set", cards, CONTACTS),
    },
    events: {
      knownUids: async (accountId: string) =>
        new Set(
          (await collect(accountId, "CalendarEvent", ["uid"], CALENDARS)).map(
            (e) => e.uid as string,
          ),
        ),
      parse: (accountId: string, texts: string[]) =>
        parse(accountId, "CalendarEvent/parse", "text/calendar", texts, CALENDARS),
      defaultCalendar: (accountId: string) => defaultId(accountId, "Calendar/get", CALENDARS),
      create: (accountId: string, events: Record<string, unknown>[]) =>
        create(accountId, "CalendarEvent/set", events, CALENDARS),
    },
  };
};

export type Importer = ReturnType<typeof createImporter>;
