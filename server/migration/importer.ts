/**
 * Writing moved data into one Stalwart account with the server's key (needs `impersonate`, see
 * server/company/mailstore.ts): mails with Email/import (RFC 8621 §4.8), contacts with
 * ContactCard/parse and appointments with CalendarEvent/parse, then /set. Blobs go inline with
 * Blob/upload (RFC 9404) where they fit into one request (Stalwart: 10 MB per request).
 */
import type { StalwartRequest, StalwartUpload } from "../company/management";

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
  seen: boolean;
  receivedAt: string | null;
};
export type Outcome = { imported: number; failed: string[] };

type Response = Record<string, unknown>;

const failures = (result: Response, key: string): string[] =>
  Object.values((result[key] ?? {}) as Record<string, { type: string; description?: string }>).map(
    (error) => error.description ?? error.type,
  );

const base64 = (data: Uint8Array | string) =>
  Buffer.from(typeof data === "string" ? new TextEncoder().encode(data) : data).toString("base64");

export const createImporter = (request: StalwartRequest, upload: StalwartUpload) => {
  /** Every value of `property` of all objects a query finds, page by page. */
  const collect = async (
    accountId: string,
    method: "Email" | "ContactCard" | "CalendarEvent",
    property: string,
    using: string[],
  ): Promise<unknown[]> => {
    const values: unknown[] = [];
    for (let position = 0; ; position += PAGE) {
      const [query, get] = await request(
        [
          [`${method}/query`, { accountId, position, limit: PAGE }, "q"],
          [
            `${method}/get`,
            {
              accountId,
              "#ids": { resultOf: "q", name: `${method}/query`, path: "/ids" },
              properties: [property],
            },
            "g",
          ],
        ],
        using,
      );
      const list = (get![1].list ?? []) as Record<string, unknown>[];
      values.push(...list.map((item) => item[property]));
      if ((query![1].ids as string[]).length < PAGE) return values;
    }
  };

  /** Message-IDs of the mails already in the account, against duplicates. */
  const knownMessageIds = async (accountId: string): Promise<Set<string>> =>
    new Set(
      (await collect(accountId, "Email", "messageId", MAIL)).flatMap(
        (ids) => ids ?? [],
      ) as string[],
    );

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
  ): Promise<string> => {
    const [[, result]] = (await request(
      [["Mailbox/set", { accountId, create: { f: { name, parentId } } }, "0"]],
      MAIL,
    )) as [[string, Response, string]];
    const id = (result.created as Record<string, { id: string }> | undefined)?.f?.id;
    if (!id) throw new Error(`Ordner ${name}: ${failures(result, "notCreated")[0] ?? "Fehler"}`);
    return id;
  };

  const importArgs = (mail: MailToImport, blobId: string) => ({
    blobId,
    mailboxIds: { [mail.mailboxId]: true },
    keywords: mail.seen ? { $seen: true } : {},
    ...(mail.receivedAt ? { receivedAt: mail.receivedAt } : {}),
  });

  /** One batch of small mails in one request; a large mail alone through the upload. */
  const importMails = async (accountId: string, mails: MailToImport[]): Promise<Outcome> => {
    if (mails.length === 1 && mails[0]!.raw.length > INLINE_LIMIT) {
      const mail = mails[0]!;
      const blobId = await upload(accountId, mail.raw, "message/rfc822").catch(() => null);
      if (!blobId) return { imported: 0, failed: ["Mail zu groß zum Hochladen"] };
      const [[, result]] = (await request(
        [["Email/import", { accountId, emails: { e: importArgs(mail, blobId) } }, "0"]],
        MAIL,
      )) as [[string, Response, string]];
      return {
        imported: Object.keys(result.created ?? {}).length,
        failed: failures(result, "notCreated"),
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
    return {
      imported: Object.keys(result.created ?? {}).length,
      failed: failures(result, "notCreated"),
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
    folders,
    createFolder,
    importMails,
    contacts: {
      known: async (accountId: string) => {
        const [names, emails] = await Promise.all([
          collect(accountId, "ContactCard", "name", CONTACTS),
          collect(accountId, "ContactCard", "emails", CONTACTS),
        ]);
        return names.map((name, i) => ({ name, emails: emails[i] }));
      },
      parse: (accountId: string, texts: string[]) =>
        parse(accountId, "ContactCard/parse", "text/vcard", texts, CONTACTS),
      defaultBook: (accountId: string) => defaultId(accountId, "AddressBook/get", CONTACTS),
      create: (accountId: string, cards: Record<string, unknown>[]) =>
        create(accountId, "ContactCard/set", cards, CONTACTS),
    },
    events: {
      knownUids: async (accountId: string) =>
        new Set((await collect(accountId, "CalendarEvent", "uid", CALENDARS)) as string[]),
      parse: (accountId: string, texts: string[]) =>
        parse(accountId, "CalendarEvent/parse", "text/calendar", texts, CALENDARS),
      defaultCalendar: (accountId: string) => defaultId(accountId, "Calendar/get", CALENDARS),
      create: (accountId: string, events: Record<string, unknown>[]) =>
        create(accountId, "CalendarEvent/set", events, CALENDARS),
    },
  };
};

export type Importer = ReturnType<typeof createImporter>;
