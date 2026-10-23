/**
 * Fills a local Stalwart with the "Weber Haustechnik" test data. Idempotent: everything is looked
 * up first (domain, accounts, folders by name, mails by Message-ID, contacts and events by UID), so
 * running it again only adds what is missing.
 *
 *   bun dev/seed.ts                  # against the dev instance on 18080
 *   bun dev/seed.ts --http 28080     # against the e2e instance
 */
import { parseArgs } from "node:util";
import { assertSetOk, CAPABILITIES, createJmapClient, type JmapClient } from "../src/jmap/client";
import { DEV_DOMAIN, DEV_PASSWORD, STALWART_ADMIN } from "./config";
import { buildMessage } from "./mime";
import { contacts, events, folders, groups, mails, type SeedMail, users } from "./seed-data";

const { values: args } = parseArgs({ options: { http: { type: "string", default: "18080" } } });
const origin = `http://127.0.0.1:${args.http}`;
const ADMIN_USING = [CAPABILITIES.core, CAPABILITIES.stalwart];

const admin = createJmapClient({
  origin,
  credentials: { username: STALWART_ADMIN.user, password: STALWART_ADMIN.password },
});

const userClient = (name: string): JmapClient =>
  createJmapClient({
    origin,
    credentials: { username: `${name}@${DEV_DOMAIN}`, password: DEV_PASSWORD },
  });

type Named = { id: string; name: string };

const ensureDomain = async (): Promise<string> => {
  const { list } = await admin.call<{ list: Named[] }>(
    "x:Domain/get",
    { ids: null, properties: ["name"] },
    ADMIN_USING,
  );
  const existing = list.find((domain) => domain.name === DEV_DOMAIN);
  if (existing) return existing.id;
  const result = await admin.call<{ created: Record<string, { id: string }> }>(
    "x:Domain/set",
    { create: { d: { name: DEV_DOMAIN, description: "Weber Haustechnik (Testdaten)" } } },
    ADMIN_USING,
  );
  assertSetOk(result, "Domain");
  return result.created.d!.id;
};

const ensureAccounts = async (domainId: string): Promise<void> => {
  const existing = async () =>
    (
      await admin.call<{ list: Named[] }>(
        "x:Account/get",
        { ids: null, properties: ["name"] },
        ADMIN_USING,
      )
    ).list;

  const before = await existing();
  const groupCreates = Object.fromEntries(
    groups
      .filter((group) => !before.some((account) => account.name === group.name))
      .map((group) => [
        group.name,
        { "@type": "Group", name: group.name, domainId, description: group.description },
      ]),
  );
  if (Object.keys(groupCreates).length > 0) {
    assertSetOk(
      await admin.call("x:Account/set", { create: groupCreates }, ADMIN_USING),
      "Gruppen",
    );
  }

  const after = await existing();
  const groupId = (name: string) => after.find((account) => account.name === name)!.id;
  const userCreates = Object.fromEntries(
    users
      .filter((user) => !after.some((account) => account.name === user.name))
      .map((user) => [
        user.name,
        {
          "@type": "User",
          name: user.name,
          domainId,
          description: user.fullName,
          memberGroupIds: Object.fromEntries(user.groups.map((g) => [groupId(g), true])),
          credentials: { "0": { "@type": "Password", secret: DEV_PASSWORD } },
        },
      ]),
  );
  if (Object.keys(userCreates).length > 0) {
    assertSetOk(
      await admin.call("x:Account/set", { create: userCreates }, ADMIN_USING),
      "Benutzer",
    );
  }
};

/** Mailbox owner ("jonas", "info", …) → JMAP account id, as seen by a user with access. */
const accountIdOf = async (client: JmapClient, owner: string): Promise<string> => {
  const session = await client.getSession();
  const entry = Object.entries(session.accounts).find(
    ([, account]) => account.name === `${owner}@${DEV_DOMAIN}`,
  );
  if (!entry) throw new Error(`Kein Zugriff auf ${owner}@${DEV_DOMAIN}`);
  return entry[0];
};

/** A user who can open the owner's mailbox: the owner, or for groups their first member. */
const clientFor = (owner: string): JmapClient => {
  if (users.some((user) => user.name === owner)) return userClient(owner);
  const member = users.find((user) => user.groups.includes(owner));
  if (!member) throw new Error(`Niemand ist Mitglied von ${owner}`);
  return userClient(member.name);
};

type Mailbox = { id: string; name: string; role: string | null; parentId: string | null };

const ROLE_BY_FOLDER: Record<string, string> = { Posteingang: "inbox", Archiv: "archive" };

const ensureFolders = async (owner: string): Promise<Map<string, string>> => {
  const client = clientFor(owner);
  const accountId = await accountIdOf(client, owner);
  const load = async () =>
    (
      await client.call<{ list: Mailbox[] }>("Mailbox/get", {
        accountId,
        properties: ["name", "role", "parentId"],
      })
    ).list;

  let mailboxes = await load();
  const paths = new Map<string, string>();
  for (const mailbox of mailboxes)
    if (mailbox.role === "inbox") paths.set("Posteingang", mailbox.id);

  for (const path of folders[owner] ?? []) {
    const parts = path.split("/");
    const name = parts.at(-1)!;
    const parentId = parts.length > 1 ? (paths.get(parts.slice(0, -1).join("/")) ?? null) : null;
    const role = ROLE_BY_FOLDER[path];
    const found = mailboxes.find(
      (m) => (role && m.role === role) || (m.name === name && m.parentId === parentId),
    );
    if (found) {
      paths.set(path, found.id);
      continue;
    }
    const result = await client.call<{ created: Record<string, { id: string }> }>("Mailbox/set", {
      accountId,
      create: { m: { name, parentId, ...(role ? { role } : {}) } },
    });
    assertSetOk(result, `Ordner ${path}`);
    paths.set(path, result.created.m!.id);
    mailboxes = await load();
  }
  return paths;
};

/** Message-IDs already in a mailbox account, so a mail is imported only once. */
const knownMessageIds = async (client: JmapClient, accountId: string): Promise<Set<string>> => {
  const [, get] = await client.request([
    ["Email/query", { accountId, limit: 1000 }, "q"],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: ["messageId"],
      },
      "g",
    ],
  ]);
  const list = (get![1].list ?? []) as { messageId: string[] | null }[];
  return new Set(list.flatMap((email) => email.messageId ?? []));
};

const importMail = async (
  mail: SeedMail,
  folderIds: Map<string, string>,
  known: Set<string>,
): Promise<boolean> => {
  if (known.has(mail.id)) return false;
  const client = clientFor(mail.owner);
  const accountId = await accountIdOf(client, mail.owner);

  const date = new Date(Date.now() - mail.hoursAgo * 3_600_000);
  const raw = buildMessage({
    messageId: mail.id,
    inReplyTo: mail.inReplyTo,
    from: mail.from,
    to: mail.to,
    cc: mail.cc,
    subject: mail.subject,
    date,
    text: mail.body,
    attachment: mail.attachment,
  });
  const { blobId } = await client.upload(accountId, raw, "message/rfc822");
  const mailboxId = folderIds.get(mail.folder);
  if (!mailboxId) throw new Error(`Ordner ${mail.folder} fehlt bei ${mail.owner}`);
  const keywords = {
    ...(mail.seen ? { $seen: true } : {}),
    ...(mail.flagged ? { $flagged: true } : {}),
  };
  const result = await client.call("Email/import", {
    accountId,
    emails: {
      e: { blobId, mailboxIds: { [mailboxId]: true }, keywords, receivedAt: date.toISOString() },
    },
  });
  assertSetOk(result, `Mail ${mail.subject}`);
  return true;
};

const defaultCollectionId = async (
  client: JmapClient,
  accountId: string,
  type: "AddressBook" | "Calendar",
) => {
  const { list } = await client.call<{ list: { id: string; isDefault: boolean }[] }>(
    `${type}/get`,
    { accountId },
  );
  const found = list.find((item) => item.isDefault) ?? list[0];
  if (!found) throw new Error(`Kein ${type} für ${accountId}`);
  return found.id;
};

const ensureContacts = async (): Promise<number> => {
  let created = 0;
  for (const owner of new Set(contacts.map((c) => c.owner))) {
    const client = clientFor(owner);
    const accountId = await accountIdOf(client, owner);
    const addressBookId = await defaultCollectionId(client, accountId, "AddressBook");
    const { list } = await client.call<{ list: { uid: string }[] }>("ContactCard/get", {
      accountId,
      properties: ["uid"],
    });
    const known = new Set(list.map((card) => card.uid));
    const create = Object.fromEntries(
      contacts
        .filter((c) => c.owner === owner && !known.has(c.uid))
        .map((c) => [
          c.uid,
          {
            "@type": "Card",
            version: "1.0",
            uid: c.uid,
            kind: "individual",
            addressBookIds: { [addressBookId]: true },
            name: {
              components: [
                { kind: "given", value: c.given },
                { kind: "surname", value: c.surname },
              ],
              isOrdered: true,
            },
            ...(c.company ? { organizations: { o: { name: c.company } } } : {}),
            ...(c.email ? { emails: { e: { address: c.email, contexts: { work: true } } } } : {}),
            ...(c.phone ? { phones: { p: { number: c.phone, features: { voice: true } } } } : {}),
            ...(c.street || c.city
              ? {
                  addresses: {
                    a: {
                      components: [
                        ...(c.street ? [{ kind: "name", value: c.street }] : []),
                        ...(c.city ? [{ kind: "locality", value: c.city }] : []),
                      ],
                    },
                  },
                }
              : {}),
            ...(c.note ? { notes: { n: { note: c.note } } } : {}),
          },
        ]),
    );
    if (Object.keys(create).length === 0) continue;
    assertSetOk(await client.call("ContactCard/set", { accountId, create }), "Kontakte");
    created += Object.keys(create).length;
  }
  return created;
};

/** Local date-time in Europe/Berlin for "today + days" at "HH:MM", as JSCalendar LocalDateTime. */
const localStart = (days: number, time: string): string => {
  const date = new Date(Date.now() + days * 86_400_000);
  const ymd = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(date);
  return `${ymd}T${time}:00`;
};

const ensureEvents = async (): Promise<number> => {
  let created = 0;
  for (const owner of new Set(events.map((e) => e.owner))) {
    const client = clientFor(owner);
    const accountId = await accountIdOf(client, owner);
    const calendarId = await defaultCollectionId(client, accountId, "Calendar");
    const { list } = await client.call<{ list: { uid: string }[] }>("CalendarEvent/get", {
      accountId,
      properties: ["uid"],
    });
    const known = new Set(list.map((event) => event.uid));
    const ownerEmail = `${owner}@${DEV_DOMAIN}`;
    const create = Object.fromEntries(
      events
        .filter((e) => e.owner === owner && !known.has(e.uid))
        .map((e) => [
          e.uid,
          {
            "@type": "Event",
            uid: e.uid,
            calendarIds: { [calendarId]: true },
            title: e.title,
            start: localStart(e.day, e.time),
            timeZone: "Europe/Berlin",
            duration: `PT${Math.floor(e.minutes / 60) ? `${Math.floor(e.minutes / 60)}H` : ""}${e.minutes % 60 ? `${e.minutes % 60}M` : ""}`,
            ...(e.description ? { description: e.description } : {}),
            ...(e.location ? { locations: { l: { "@type": "Location", name: e.location } } } : {}),
            ...(e.attendees?.length
              ? {
                  organizerCalendarAddress: `mailto:${ownerEmail}`,
                  participants: {
                    owner: {
                      "@type": "Participant",
                      calendarAddress: `mailto:${ownerEmail}`,
                      roles: { owner: true, attendee: true },
                      participationStatus: "accepted",
                    },
                    ...Object.fromEntries(
                      e.attendees.map((address, index) => [
                        `a${index}`,
                        {
                          "@type": "Participant",
                          calendarAddress: `mailto:${address}`,
                          roles: { attendee: true },
                          participationStatus: "needs-action",
                          expectReply: true,
                        },
                      ]),
                    ),
                  },
                }
              : {}),
          },
        ]),
    );
    if (Object.keys(create).length === 0) continue;
    assertSetOk(
      await client.call("CalendarEvent/set", { accountId, create, sendSchedulingMessages: true }),
      "Termine",
    );
    created += Object.keys(create).length;
  }
  return created;
};

const main = async (): Promise<void> => {
  const domainId = await ensureDomain();
  await ensureAccounts(domainId);

  const folderIds = new Map<string, Map<string, string>>();
  for (const owner of new Set([...Object.keys(folders), ...mails.map((m) => m.owner)])) {
    folderIds.set(owner, await ensureFolders(owner));
  }

  let imported = 0;
  for (const owner of new Set(mails.map((m) => m.owner))) {
    const client = clientFor(owner);
    const known = await knownMessageIds(client, await accountIdOf(client, owner));
    for (const mail of mails.filter((m) => m.owner === owner)) {
      if (await importMail(mail, folderIds.get(owner)!, known)) imported++;
    }
  }
  const createdContacts = await ensureContacts();
  const createdEvents = await ensureEvents();

  console.log(
    `Testdaten bereit: ${users.length} Benutzer, ${groups.length} gemeinsame Postfächer, ${imported} neue Mails, ${createdContacts} neue Kontakte, ${createdEvents} neue Termine.`,
  );
  console.log(`Anmelden als jonas@${DEV_DOMAIN} / ${DEV_PASSWORD}`);
};

await main();
