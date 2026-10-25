/**
 * The key of a call in a confidential channel (docs/encryption.md, building block 5): LiveKit
 * encrypts sound and picture with it end to end. Whoever joins first makes it and seals it to
 * every member's own OpenPGP key, signed; the others open it and check that a member signed it –
 * so the server, which passes it on, can neither read nor swap it.
 */
import { m } from "@/paraglide/messages";
import { currentUnlocked } from "../pgp/queries";

const openpgp = () => import("openpgp");

const membersKeys = async (channelId: string) => {
  const response = await fetch(`/api/chat/channels/${encodeURIComponent(channelId)}/keys`, {
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(String(response.status));
  const { readKey } = await openpgp();
  const { keys } = (await response.json()) as { keys: { publicKey: string }[] };
  return Promise.all(keys.map((entry) => readKey({ armoredKey: entry.publicKey })));
};

const unlocked = () => {
  const key = currentUnlocked();
  if (!key) throw new Error(m.call_confidential_locked());
  return key;
};

/** A new random key for the call, sealed to all members. */
export const newCallKey = async (channelId: string): Promise<string> => {
  const signingKeys = unlocked();
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = btoa(String.fromCharCode(...bytes));
  const { createMessage, encrypt } = await openpgp();
  return (await encrypt({
    message: await createMessage({ text: secret }),
    encryptionKeys: await membersKeys(channelId),
    signingKeys,
  })) as string;
};

/** The call's key, opened; only when a member of the channel signed it. */
export const openCallKey = async (channelId: string, sealed: string): Promise<string> => {
  const decryptionKeys = unlocked();
  const { decrypt, readMessage } = await openpgp();
  const { data } = await decrypt({
    message: await readMessage({ armoredMessage: sealed }),
    decryptionKeys,
    verificationKeys: await membersKeys(channelId),
    expectSigned: true,
  });
  return data as string;
};
