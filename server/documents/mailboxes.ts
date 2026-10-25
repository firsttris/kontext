/**
 * Documents of a shared mailbox (info@, rechnung@): one folder in Dokumente that belongs to the
 * mailbox itself, not to whoever made it first, named after its address. Kontext acts there as the
 * mailbox (a token with its own subject, schreibzeug.ts) and keeps the folder shared with the
 * mailbox's people as Stalwart has them: members may change its files, readers only open them.
 * Members see it under "Für mich freigegeben" in Dokumente and beside their own files in Kontext.
 */
import type { DocumentShare, Person, Schreibzeug } from "./schreibzeug";

export type MailboxRole = "edit" | "view";

/** A shared mailbox and who works in it, by address. */
export type MailboxPeople = {
  id: string;
  email: string;
  people: { email: string; role: MailboxRole }[];
};

/** The company's shared mailboxes (with Stalwart's admin key, see app.ts). */
export type LoadMailboxes = () => Promise<MailboxPeople[]>;

/** The mailbox as a person of Dokumente; its subject never matches one of Kontext's user ids. */
export const mailboxPerson = (mailbox: Pick<MailboxPeople, "id" | "email">): Person => ({
  id: `mailbox:${mailbox.id}`,
  email: mailbox.email,
  name: mailbox.email,
});

export type ShareChange =
  | { kind: "put"; email: string; role: MailboxRole }
  | { kind: "remove"; userId: string };

/** What turns the folder's shares into exactly the mailbox's people. Pure. */
export const shareChanges = (
  current: DocumentShare[],
  people: MailboxPeople["people"],
): ShareChange[] => {
  const wanted = new Map(people.map((person) => [person.email.toLowerCase(), person.role]));
  const have = new Map(current.map((share) => [share.email.toLowerCase(), share]));
  return [
    ...current.flatMap((share): ShareChange[] =>
      wanted.has(share.email.toLowerCase()) ? [] : [{ kind: "remove", userId: share.userId }],
    ),
    ...[...wanted].flatMap(([email, role]): ShareChange[] =>
      have.get(email)?.role === role ? [] : [{ kind: "put", email, role }],
    ),
  ];
};

export const createMailboxFolders = ({
  schreibzeug,
  load,
}: {
  schreibzeug: Schreibzeug;
  load: LoadMailboxes;
}) => {
  /** Mailbox id → its folder's id; asked once, also when several ask at the same time. */
  const folders = new Map<string, Promise<string>>();

  const findOrCreate = async (mailbox: MailboxPeople): Promise<string> => {
    const owner = mailboxPerson(mailbox);
    const { children } = await schreibzeug.list(owner, null);
    const found = children.find((node) => node.kind === "folder" && node.name === mailbox.email);
    return (found ?? (await schreibzeug.createFolder(owner, null, mailbox.email))).id;
  };

  const folderOf = (mailbox: MailboxPeople): Promise<string> => {
    const known = folders.get(mailbox.id);
    if (known) return known;
    const asked = findOrCreate(mailbox);
    folders.set(mailbox.id, asked);
    // Asked again next time when Schreibzeug was not there.
    asked.catch(() => folders.delete(mailbox.id));
    return asked;
  };

  const sync = async (mailbox: MailboxPeople): Promise<string> => {
    const owner = mailboxPerson(mailbox);
    const folderId = await folderOf(mailbox);
    const changes = shareChanges(await schreibzeug.shares(owner, folderId), mailbox.people);
    for (const change of changes) {
      if (change.kind === "remove") await schreibzeug.unshare(owner, folderId, change.userId);
      else await schreibzeug.share(owner, folderId, change.email, change.role);
    }
    return folderId;
  };

  const inMailbox = (mailbox: MailboxPeople, email: string) =>
    mailbox.people.some((person) => person.email.toLowerCase() === email.toLowerCase());

  return {
    /** The folders of the mailboxes the person works in, made and shared as they stand now. */
    foldersFor: async (email: string) => {
      const mailboxes = (await load()).filter((mailbox) => inMailbox(mailbox, email));
      return Promise.all(
        mailboxes.map(async (mailbox) => ({
          accountId: mailbox.id,
          email: mailbox.email,
          folderId: await sync(mailbox),
        })),
      );
    },
    /** The people of these mailboxes, of those the person works in themselves. */
    peopleOf: async (email: string, accountIds: string[]): Promise<string[]> =>
      (await load())
        .filter((mailbox) => accountIds.includes(mailbox.id) && inMailbox(mailbox, email))
        .flatMap((mailbox) => mailbox.people.map((person) => person.email.toLowerCase())),
    /**
     * The mailboxes the person is a member of, as persons of Dokumente, to share files the mailbox
     * owns; who only reads a mailbox shares none of its files.
     */
    ownersFor: async (email: string): Promise<Person[]> =>
      (await load())
        .filter((mailbox) =>
          mailbox.people.some(
            (person) =>
              person.email.toLowerCase() === email.toLowerCase() && person.role === "edit",
          ),
        )
        .map(mailboxPerson),
    /** After the Firmenverwaltung changed who works in a mailbox. */
    changed: async (mailboxId: string) => {
      const mailbox = (await load()).find((each) => each.id === mailboxId);
      if (mailbox) await sync(mailbox);
    },
  };
};

export type MailboxFolders = ReturnType<typeof createMailboxFolders>;
