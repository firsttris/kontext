/**
 * Sending encrypted from the composer: whether it can be (one's own key for the sending address,
 * a key for every recipient), asking for the passphrase when the key is still locked, and the
 * sending itself – the mail built in the browser, encrypted and signed, sent as it is
 * (src/lib/pgp-mail.ts, src/jmap/send-raw.ts).
 */
import type { PrivateKey } from "openpgp";
import { type FormEvent, type ReactNode, useState } from "react";
import { useClient } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Hold, OutgoingEmail } from "@/jmap/mail";
import { sendRaw } from "@/jmap/send-raw";
import { unlockKey } from "@/lib/pgp";
import { encryptMail } from "@/lib/pgp-mail";
import { m } from "@/paraglide/messages";
import { keepUnlocked, useKnownKeys, useOwnKey, useUnlockedKey } from "./queries";

/** Long header lines folded for the raw mail. */
const foldHeader = (name: string, value: string) =>
  `${name}: ${value.replace(/(.{76})(?=.)/g, "$1\r\n ")}`;

export const useEncryptedSend = (from: string | undefined, recipients: string[]) => {
  const client = useClient();
  const { data: own } = useOwnKey();
  const known = useKnownKeys();
  const unlocked = useUnlockedKey();
  const [asking, setAsking] = useState<{
    resolve: (key: PrivateKey) => void;
    reject: (error: Error) => void;
  } | null>(null);

  const lower = recipients.map((address) => address.toLowerCase());
  const ownAddress = own?.email;
  const missing = lower.filter(
    (address) => address !== ownAddress && !known.some((key) => key.email === address),
  );
  const forSender = Boolean(own && from && own.email === from.toLowerCase());
  const reason = !own
    ? m.pgp_send_no_key()
    : !forSender
      ? m.pgp_send_other_sender()
      : missing.length
        ? m.pgp_send_missing({ addresses: missing.join(", ") })
        : null;

  /** The unlocked key; asks for the passphrase first if needed. */
  const ensureUnlocked = () =>
    unlocked
      ? Promise.resolve(unlocked)
      : new Promise<PrivateKey>((resolve, reject) => setAsking({ resolve, reject }));

  const send = async (
    mail: OutgoingEmail,
    folders: { draftsId: string; sentId: string },
    hold?: Hold,
  ) => {
    if (reason) throw new Error(reason);
    const key = await ensureUnlocked();
    const id = crypto.randomUUID();
    const attachments = await Promise.all(
      mail.attachments.map(async (file) => ({
        name: file.name,
        type: file.type,
        bytes: new Uint8Array(
          await (
            await client.download(mail.accountId, file.blobId, file.name, file.type)
          ).arrayBuffer(),
        ),
      })),
    );
    const raw = await encryptMail({
      envelope: {
        from: { name: mail.identity.name || null, email: mail.identity.email },
        to: mail.to,
        cc: mail.cc,
        subject: mail.subject,
        date: new Date(),
        messageId: `${id}@${mail.identity.email.split("@")[1]}`,
        inReplyTo: mail.inReplyTo,
        references: mail.references,
        extra: mail.autocrypt ? [foldHeader("Autocrypt", mail.autocrypt)] : [],
      },
      content: { text: mail.text, html: mail.html, attachments },
      recipientKeys: known
        .filter((entry) => lower.includes(entry.email) && entry.email !== ownAddress)
        .map((entry) => entry.publicKey),
      ownKey: key,
      id,
    });
    return sendRaw(client, {
      accountId: mail.accountId,
      raw,
      identityId: mail.identity.id,
      from: mail.identity.email,
      recipients: [...mail.to, ...mail.cc, ...mail.bcc].map((address) => address.email),
      ...folders,
      hold,
      replacesDraft: mail.draftId,
    });
  };

  const dialog: ReactNode = asking ? (
    <UnlockDialog
      privateKey={own?.privateKey ?? ""}
      onUnlocked={(key) => {
        keepUnlocked(key);
        asking.resolve(key);
        setAsking(null);
      }}
      onCancel={() => {
        asking.reject(new Error(m.pgp_send_cancelled()));
        setAsking(null);
      }}
    />
  ) : null;

  return { available: !reason, reason, send, dialog };
};

const UnlockDialog = ({
  privateKey,
  onUnlocked,
  onCancel,
}: {
  privateKey: string;
  onUnlocked: (key: PrivateKey) => void;
  onCancel: () => void;
}) => {
  const [passphrase, setPassphrase] = useState("");
  const [wrong, setWrong] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      onUnlocked(await unlockKey(privateKey, passphrase));
    } catch {
      setWrong(true);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onCancel()}
      title={m.pgp_unlock()}
      description={m.pgp_unlock_send_hint()}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <Input
          type="password"
          autoFocus
          aria-label={m.pgp_unlock_passphrase()}
          placeholder={m.pgp_unlock_passphrase()}
          value={passphrase}
          onChange={(event) => {
            setPassphrase(event.target.value);
            setWrong(false);
          }}
        />
        {wrong ? (
          <span role="alert" className="text-[13px] text-danger">
            {m.pgp_wrong_passphrase()}
          </span>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {m.tasks_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={!passphrase}>
            {m.pgp_unlock()}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
