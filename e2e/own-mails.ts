import { buildMessage } from "../dev/mime";
import { mails } from "../dev/seed-data";
import { assertSetOk } from "../src/jmap/client";
import { address, jmapAs } from "./helpers";

/**
 * A copy of one of the seed's mails (dev/seed-data.ts) with a subject of its own, newest in a
 * mailbox's inbox: for tests that open a mail from the list. The seed's own mails slide out of the
 * list's rendered rows once other tests have filled the inbox; a fresh copy is on top. `remove`
 * takes it away again (in `finally`).
 */
export const copySeedMail = async (
  user: string,
  seedId: string,
  { mailbox = user, seen }: { mailbox?: string; seen?: boolean } = {},
) => {
  const seed = mails.find((mail) => mail.id === seedId);
  if (!seed) throw new Error(`Keine Mail ${seedId} in den Testdaten`);
  const tag = crypto.randomUUID().slice(0, 8);
  const subject = `${seed.subject} ${tag}`;
  const client = jmapAs(user);
  const session = await client.getSession();
  const accountId = Object.entries(session.accounts).find(
    ([, account]) => account.name === address(mailbox),
  )![0];
  const { list } = await client.call<{ list: { id: string; role: string | null }[] }>(
    "Mailbox/get",
    { accountId, properties: ["role"] },
  );
  const inbox = list.find((box) => box.role === "inbox")!.id;
  const date = new Date();
  const raw = buildMessage({
    messageId: `${tag}-${seed.id}`,
    from: seed.from,
    to: seed.to,
    cc: seed.cc,
    subject,
    date,
    text: seed.body,
    html: seed.html,
    attachment: seed.attachment,
  });
  const { blobId } = await client.upload(accountId, raw, "message/rfc822");
  const result = await client.call<{ created?: Record<string, { id: string }> }>("Email/import", {
    accountId,
    emails: {
      e: {
        blobId,
        mailboxIds: { [inbox]: true },
        keywords: (seen ?? seed.seen) ? { $seen: true } : {},
        receivedAt: date.toISOString(),
      },
    },
  });
  assertSetOk(result, `Kopie von ${seed.subject}`);
  const id = result.created!.e!.id;
  return {
    subject,
    /** Takes the copy away again; a reply or forward sent from it stays. */
    remove: async () => {
      await client.call("Email/set", { accountId, destroy: [id] });
    },
  };
};
