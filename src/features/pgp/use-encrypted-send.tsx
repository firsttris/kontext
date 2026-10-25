/**
 * "Vertraulich senden" from the composer (docs/encryption.md, building blocks 3 and 4): recipients
 * with a known key get the mail encrypted and signed with PGP (built in the browser, sent as it
 * is); everyone else a link to a page on the own server, where the content waits encrypted with a
 * key that is only in the link, opened with a code passed on another way. Needs one's own key for
 * the sending address; asks for its passphrase when signing.
 */
import type { PrivateKey } from "openpgp";
import { type FormEvent, type ReactNode, useState } from "react";
import { useClient } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type Hold, type OutgoingEmail, sendEmail } from "@/jmap/mail";
import { sendRaw } from "@/jmap/send-raw";
import type { EmailAddress } from "@/jmap/types";
import { escapeHtml } from "@/lib/html";
import { unlockKey } from "@/lib/pgp";
import { encryptMail } from "@/lib/pgp-mail";
import {
  bytesToBase64,
  keyToFragment,
  newSecureKey,
  type SecureContent,
  seal,
  secureCode,
  wrapForSender,
} from "@/lib/secure";
import { m } from "@/paraglide/messages";
import { send as api, type SentCode, showCodes } from "../secure/queries";
import { keepUnlocked, useKnownKeys, useOwnKey, useUnlockedKey } from "./queries";

/** Long header lines folded for the raw mail. */
const foldHeader = (name: string, value: string) =>
  `${name}: ${value.replace(/(.{76})(?=.)/g, "$1\r\n ")}`;

/** How long a link can be opened. */
const LINK_DAYS = 30;

const untilLabel = (date: Date) =>
  date.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "long" });

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
  const hasKey = (address: string) => known.some((key) => key.email === address);
  const viaPgp = lower.filter((address) => address !== ownAddress && hasKey(address));
  const viaLink = lower.filter((address) => address !== ownAddress && !hasKey(address));
  const forSender = Boolean(own && from && own.email === from.toLowerCase());
  const reason = !own ? m.pgp_send_no_key() : !forSender ? m.pgp_send_other_sender() : null;

  /** The unlocked key; asks for the passphrase first if needed. */
  const ensureUnlocked = () =>
    unlocked
      ? Promise.resolve(unlocked)
      : new Promise<PrivateKey>((resolve, reject) => setAsking({ resolve, reject }));

  /** One link per recipient without a key; the mail that brings it; its code. */
  const sendLink = async (
    mail: OutgoingEmail,
    to: EmailAddress,
    content: SecureContent,
    folders: { draftsId: string; sentId: string },
  ): Promise<SentCode> => {
    const key = newSecureKey();
    const code = secureCode();
    const { id } = await api<{ id: string }>("POST", "secure", {
      to: to.email,
      fromName: mail.identity.name || mail.identity.email,
      fromEmail: mail.identity.email,
      ciphertext: await seal(key, content),
      senderKey: await wrapForSender(key, own!.publicKey),
      code,
      expiresDays: LINK_DAYS,
    });
    const link = `${window.location.origin}/s/${id}#${keyToFragment(key)}`;
    const name = mail.identity.name || mail.identity.email;
    const until = untilLabel(new Date(Date.now() + LINK_DAYS * 86_400_000));
    const text = m.secure_mail_text({ name, link, until });
    await sendEmail(
      client,
      {
        ...mail,
        to: [to],
        cc: [],
        bcc: [],
        subject: m.secure_mail_subject({ name }),
        text,
        html: `<p>${escapeHtml(text)
          .replace(link, `<a href="${link}">${m.secure_mail_open()}</a>`)
          .replace(/\n\n/g, "</p><p>")
          .replace(/\n/g, "<br>")}</p>`,
        attachments: [],
        draftId: null,
        requestReceipt: false,
      },
      folders,
    );
    return { to: to.email, code };
  };

  const send = async (
    mail: OutgoingEmail,
    folders: { draftsId: string; sentId: string },
    hold?: Hold,
  ) => {
    if (reason) throw new Error(reason);
    const key = viaPgp.length ? await ensureUnlocked() : null;
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
    const everyone = [...mail.to, ...mail.cc, ...mail.bcc];
    const keyed = (list: EmailAddress[]) =>
      list.filter((a) => viaPgp.includes(a.email.toLowerCase()));
    let held: { emailId: string; submissionId: string } | null = null;
    if (key) {
      const raw = await encryptMail({
        envelope: {
          from: { name: mail.identity.name || null, email: mail.identity.email },
          to: keyed(mail.to),
          cc: keyed(mail.cc),
          subject: mail.subject,
          date: new Date(),
          messageId: `${id}@${mail.identity.email.split("@")[1]}`,
          inReplyTo: mail.inReplyTo,
          references: mail.references,
          extra: mail.autocrypt ? [foldHeader("Autocrypt", mail.autocrypt)] : [],
        },
        content: { text: mail.text, html: mail.html, attachments },
        recipientKeys: known
          .filter((entry) => viaPgp.includes(entry.email))
          .map((entry) => entry.publicKey),
        ownKey: key,
        id,
      });
      held = await sendRaw(client, {
        accountId: mail.accountId,
        raw,
        identityId: mail.identity.id,
        from: mail.identity.email,
        recipients: keyed(everyone).map((address) => address.email),
        ...folders,
        // With links going out at once, the encrypted mail goes at once too.
        hold: viaLink.length ? undefined : hold,
        replacesDraft: mail.draftId,
      });
    }
    const linked = everyone.filter((a) => viaLink.includes(a.email.toLowerCase()));
    if (linked.length) {
      const content: SecureContent = {
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments: attachments.map((file) => ({
          name: file.name,
          type: file.type,
          data: bytesToBase64(file.bytes),
        })),
        sentAt: new Date().toISOString(),
      };
      const codes: SentCode[] = [];
      for (const to of linked) codes.push(await sendLink(mail, to, content, folders));
      showCodes(codes);
    }
    return held;
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

  return { available: !reason, reason, send, dialog, viaPgp, viaLink };
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
