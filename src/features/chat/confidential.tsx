/**
 * Confidential channels (docs/encryption.md, building block 5): the app encrypts each message to
 * the members' own OpenPGP keys and signs it with one's own; the server keeps only the cipher text.
 * Opened here with one's unlocked key (src/features/pgp/queries.ts), the signature checked against
 * the author's key.
 */
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { LockKeyhole, ShieldAlert } from "lucide-react";
import { isSealed, type Message } from "@/lib/chat";
import { m } from "@/paraglide/messages";
import { Unlock } from "../pgp/pgp-mail";
import { currentUnlocked, useUnlockedKey } from "../pgp/queries";
import { send } from "./queries";

type MemberKey = { memberId: string; publicKey: string };
type Opened = { text: string; signature: "valid" | "invalid" };

/** What a message holds, as this person may see it. */
export type Shown = Message & { sealed?: "locked" | "opening" | "failed" | Opened["signature"] };

const openpgp = () => import("openpgp");

/** Opened (or written) here before: no second decryption, and one's own shows at once. */
const opened = new Map<string, Opened>();

const keysKey = (channelId: string) => ["chat", "keys", channelId];

const channelKeys = (queryClient: QueryClient, channelId: string) =>
  queryClient.fetchQuery({
    queryKey: keysKey(channelId),
    queryFn: async () =>
      (await send<{ keys: MemberKey[] }>("GET", `/channels/${encodeURIComponent(channelId)}/keys`))
        .keys,
    staleTime: 60_000,
  });

/** The text encrypted to every member and signed with one's key. */
export const sealText = async (queryClient: QueryClient, channelId: string, text: string) => {
  const key = currentUnlocked();
  if (!key) throw new Error(m.chat_confidential_locked());
  const keys = await channelKeys(queryClient, channelId);
  const { createMessage, encrypt, readKey } = await openpgp();
  const armored = (await encrypt({
    message: await createMessage({ text }),
    encryptionKeys: await Promise.all(
      keys.map((entry) => readKey({ armoredKey: entry.publicKey })),
    ),
    signingKeys: key,
  })) as string;
  opened.set(armored, { text, signature: "valid" });
  return armored;
};

const openText = async (queryClient: QueryClient, message: Message): Promise<Opened> => {
  const key = currentUnlocked();
  if (!key) throw new Error("locked");
  const author = (await channelKeys(queryClient, message.channelId)).find(
    (entry) => entry.memberId === message.authorId,
  );
  const { decrypt, readKey, readMessage } = await openpgp();
  const { data, signatures } = await decrypt({
    message: await readMessage({ armoredMessage: message.text }),
    decryptionKeys: key,
    verificationKeys: author ? [await readKey({ armoredKey: author.publicKey })] : [],
  });
  const signature = await (signatures[0]?.verified ?? Promise.reject())
    .then(() => "valid" as const)
    .catch(() => "invalid" as const);
  return { text: data as string, signature };
};

/** The message with its text opened, or why it cannot be. */
export const useOpened = (message: Message): Shown => {
  const sealed = isSealed(message.text);
  const key = useUnlockedKey();
  const queryClient = useQueryClient();
  const known = sealed ? opened.get(message.text) : undefined;
  const { data, isError } = useQuery({
    queryKey: ["chat", "opened", message.id, message.editedAt, key?.getFingerprint()],
    queryFn: async () => {
      const result = await openText(queryClient, message);
      opened.set(message.text, result);
      return result;
    },
    enabled: sealed && Boolean(key) && !known,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  if (!sealed) return message;
  const result = known ?? data;
  if (result) return { ...message, text: result.text, sealed: result.signature };
  return { ...message, text: "", sealed: !key ? "locked" : isError ? "failed" : "opening" };
};

/** In place of a text that is not open (yet). */
export const SealedLine = ({ state }: { state: NonNullable<Shown["sealed"]> }) => (
  <p className="m-0 flex items-center gap-1.5 rounded-2xl border border-dashed border-border px-3 py-1.5 text-[14px] text-muted md:border-0 md:p-0">
    <LockKeyhole size={14} aria-hidden="true" />
    {state === "locked"
      ? m.chat_confidential_closed()
      : state === "failed"
        ? m.chat_confidential_not_for_you()
        : m.pgp_decrypting()}
  </p>
);

export const ForgedNote = () => (
  <span className="flex items-center gap-1.5 text-[12px] text-danger">
    <ShieldAlert size={13} aria-hidden="true" /> {m.chat_confidential_forged()}
  </span>
);

/** Above the composer of a confidential channel while one's key is locked. */
export const ConfidentialUnlock = () => (
  <div className="rounded-xl border border-border px-3 py-2.5">
    <Unlock hint={m.chat_confidential_unlock_hint()} />
  </div>
);
