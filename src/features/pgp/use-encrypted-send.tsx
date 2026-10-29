/**
 * "Vertraulich senden" from the composer (docs/encryption.md, building blocks 3 and 4): recipients
 * with a known key get the mail encrypted and signed with PGP (built in the browser, sent as it
 * is); those with a known S/MIME certificate (and none) the same with S/MIME; everyone else a link to a page on the own server, where the content waits encrypted with a
 * key that is only in the link, opened with a code passed on another way. Needs one's own key (or,
 * for S/MIME alone, certificate) for the sending address; asks for its passphrase when signing.
 */
import type { PrivateKey } from "openpgp";
import { type FormEvent, type ReactNode, useState } from "react";
import { useClient } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  type Hold,
  type OutgoingAttachment,
  type OutgoingEmail,
  replyToOf,
  sendEmail,
} from "@/jmap/mail";
import { sendRaw } from "@/jmap/send-raw";
import type { EmailAddress } from "@/jmap/types";
import { escapeHtml } from "@/lib/html";
import { withLegalFooter } from "@/lib/legal-footer";
import { LOCALE } from "@/lib/locale";
import type { MimeAttachment } from "@/lib/mime";
import { unlockKey } from "@/lib/pgp";
import { encryptMail, signMail } from "@/lib/pgp-mail";
import {
  base64ToBytes,
  bytesToBase64,
  keyToFragment,
  newSecureKey,
  type SecureContent,
  seal,
  secureCode,
  wrapForSender,
} from "@/lib/secure";
import { type OwnSmime, openP12, smimeMail, smimeSignedMail } from "@/lib/smime";
import { m } from "@/paraglide/messages";
import { useLegalFooter } from "../company/legal-footer";
import { send as api, type SentCode, showCodes } from "../secure/queries";
import { keepSmimeOpen, useKnownCerts, useOpenSmime, useOwnCert } from "../smime/queries";
import { keepUnlocked, useKnownKeys, useOwnKey, useUnlockedKey } from "./queries";

/** Long header lines folded for the raw mail. */
const foldHeader = (name: string, value: string) =>
  `${name}: ${value.replace(/(.{76})(?=.)/g, "$1\r\n ")}`;

/** How long a link can be opened: the choices (as the server takes them), and the usual one. */
export const LINK_DAY_CHOICES = [7, 30, 90] as const;
const LINK_DAYS = 30;

const untilLabel = (date: Date) =>
  date.toLocaleDateString(LOCALE, { timeZone: "Europe/Berlin", dateStyle: "long" });

export const useEncryptedSend = (from: string | undefined, recipients: string[]) => {
  const client = useClient();
  const { data: own } = useOwnKey();
  const known = useKnownKeys();
  const unlocked = useUnlockedKey();
  const { data: ownCert } = useOwnCert();
  const certs = useKnownCerts();
  const openCert = useOpenSmime();
  const [asking, setAsking] = useState<Asking | null>(null);
  const [linkDays, setLinkDays] = useState<number>(LINK_DAYS);
  // The mail with the link is a business mail of its own: it carries the Pflichtangaben too (the
  // encrypted content has them already, from the composer).
  const legalFooter = useLegalFooter();

  const lower = recipients.map((address) => address.toLowerCase());
  const ownAddress = own?.email;
  const sender = from?.toLowerCase();
  const others = lower.filter((address) => address !== ownAddress && address !== ownCert?.email);
  const hasKey = (address: string) => known.some((key) => key.email === address);
  const smimeUsable = Boolean(ownCert && ownCert.email === sender);
  const hasCert = (address: string) =>
    smimeUsable &&
    certs.some((cert) => cert.email === address && new Date(cert.notAfter) > new Date());
  const viaPgp = others.filter(hasKey);
  const viaSmime = others.filter((address) => !hasKey(address) && hasCert(address));
  const viaLink = others.filter((address) => !hasKey(address) && !hasCert(address));
  const forSender = Boolean(own && sender && own.email === sender);
  // S/MIME alone needs no PGP key; links and PGP do (the link's key is kept locked with it).
  const needsPgp = viaPgp.length > 0 || viaLink.length > 0 || !viaSmime.length;
  const reason = !needsPgp
    ? null
    : !own
      ? m.pgp_send_no_key()
      : !forSender
        ? m.pgp_send_other_sender()
        : null;
  const note =
    !viaLink.length && !viaSmime.length
      ? m.pgp_send_on()
      : !viaLink.length && !viaPgp.length
        ? m.smime_send_on()
        : !viaPgp.length && !viaSmime.length
          ? m.secure_note_link()
          : m.secure_note_parts({
              parts: [
                viaPgp.length ? m.secure_part_pgp({ count: viaPgp.length }) : null,
                viaSmime.length ? m.secure_part_smime({ count: viaSmime.length }) : null,
                viaLink.length ? m.secure_part_link({ count: viaLink.length }) : null,
              ]
                .filter(Boolean)
                .join(", "),
            });

  /** The unlocked key; asks for the passphrase first if needed. */
  const ensureUnlocked = () =>
    unlocked
      ? Promise.resolve(unlocked)
      : new Promise<PrivateKey>((resolve, reject) =>
          setAsking({ kind: "pgp", resolve: resolve as (value: unknown) => void, reject }),
        );

  /** One's opened certificate; asks for its password first if needed. */
  const ensureCert = () =>
    openCert
      ? Promise.resolve(openCert)
      : new Promise<OwnSmime>((resolve, reject) =>
          setAsking({ kind: "smime", resolve: resolve as (value: unknown) => void, reject }),
        );

  /** The mail's attachments, fetched to go inside what is signed or encrypted. */
  /** The attachments and the images in the text (by their Content-ID), as bytes. */
  const filesOf = (mail: OutgoingEmail) =>
    Promise.all(
      [...mail.attachments, ...(mail.images ?? [])].map(
        async (file: OutgoingAttachment & { cid?: string }): Promise<MimeAttachment> => ({
          name: file.name,
          type: file.type,
          bytes: new Uint8Array(
            await (
              await client.download(mail.accountId, file.blobId, file.name, file.type)
            ).arrayBuffer(),
          ),
          ...(file.cid ? { cid: file.cid } : {}),
        }),
      ),
    );

  /**
   * Signing alone, without encrypting: with the S/MIME certificate where there is one (every mail
   * program checks it without anything else), else with the PGP key; null when neither belongs to
   * the sending address.
   */
  const signWith: "smime" | "pgp" | null = smimeUsable ? "smime" : forSender ? "pgp" : null;

  /** The mail signed, not encrypted, to everyone; "Rückgängig" and "Später" hold as usual. */
  const sendSigned = async (
    mail: OutgoingEmail,
    folders: { draftsId: string; sentId: string },
    hold?: Hold,
  ) => {
    if (!signWith) throw new Error(m.sign_no_key());
    const id = crypto.randomUUID();
    const envelope = {
      from: { name: mail.identity.name || null, email: mail.identity.email },
      to: mail.to,
      cc: mail.cc,
      replyTo: replyToOf(mail),
      subject: mail.subject,
      date: new Date(),
      messageId: `${id}@${mail.identity.email.split("@")[1]}`,
      inReplyTo: mail.inReplyTo,
      references: mail.references,
      extra: mail.autocrypt ? [foldHeader("Autocrypt", mail.autocrypt)] : [],
    };
    const content = { text: mail.text, html: mail.html, attachments: await filesOf(mail) };
    const raw =
      signWith === "smime"
        ? await smimeSignedMail({ envelope, content, own: await ensureCert(), id })
        : await signMail({ envelope, content, ownKey: await ensureUnlocked(), id });
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
      expiresDays: linkDays,
    });
    const link = `${window.location.origin}/s/${id}#${keyToFragment(key)}`;
    const name = mail.identity.name || mail.identity.email;
    const until = untilLabel(new Date(Date.now() + linkDays * 86_400_000));
    const text = m.secure_mail_text({ name, link, until });
    await sendEmail(
      client,
      {
        ...mail,
        to: [to],
        cc: [],
        bcc: [],
        subject: m.secure_mail_subject({ name }),
        ...withLegalFooter(
          {
            text,
            html: `<p>${escapeHtml(text)
              .replace(link, `<a href="${link}">${m.secure_mail_open()}</a>`)
              .replace(/\n\n/g, "</p><p>")
              .replace(/\n/g, "<br>")}</p>`,
          },
          legalFooter,
        ),
        attachments: [],
        draftId: null,
        requestReceipt: false,
        requestDelivery: false,
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
    const cert = viaSmime.length ? await ensureCert() : null;
    const id = crypto.randomUUID();
    const attachments = await filesOf(mail);
    const everyone = [...mail.to, ...mail.cc, ...mail.bcc];
    const among = (group: string[]) => (list: EmailAddress[]) =>
      list.filter((a) => group.includes(a.email.toLowerCase()));
    const keyed = among(viaPgp);
    const certified = among(viaSmime);
    const content = { text: mail.text, html: mail.html, attachments };
    const envelopeFor = (group: (list: EmailAddress[]) => EmailAddress[], messageId: string) => ({
      from: { name: mail.identity.name || null, email: mail.identity.email },
      to: group(mail.to),
      cc: group(mail.cc),
      replyTo: replyToOf(mail),
      subject: mail.subject,
      date: new Date(),
      messageId: `${messageId}@${mail.identity.email.split("@")[1]}`,
      inReplyTo: mail.inReplyTo,
      references: mail.references,
      extra: mail.autocrypt ? [foldHeader("Autocrypt", mail.autocrypt)] : [],
    });
    // Undo and later only when one mail goes and nothing else at once.
    const alone = !viaLink.length && !(key && cert);
    let held: { emailId: string; submissionId: string } | null = null;
    if (key) {
      const raw = await encryptMail({
        envelope: envelopeFor(keyed, id),
        content,
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
        hold: alone ? hold : undefined,
        replacesDraft: mail.draftId,
      });
    }
    if (cert) {
      const smimeId = key ? crypto.randomUUID() : id;
      const raw = await smimeMail({
        envelope: envelopeFor(certified, smimeId),
        content,
        recipientCerts: certs
          .filter((entry) => viaSmime.includes(entry.email))
          .map((entry) => entry.certificate),
        own: cert,
        id: smimeId,
      });
      const sent = await sendRaw(client, {
        accountId: mail.accountId,
        raw,
        identityId: mail.identity.id,
        from: mail.identity.email,
        recipients: certified(everyone).map((address) => address.email),
        ...folders,
        hold: alone ? hold : undefined,
        replacesDraft: key ? null : mail.draftId,
      });
      held = held ?? sent;
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
      kind={asking.kind}
      unlock={(secret) =>
        asking.kind === "pgp"
          ? unlockKey(own?.privateKey ?? "", secret)
          : openP12(base64ToBytes(ownCert?.p12 ?? ""), secret)
      }
      onUnlocked={(opened) => {
        if (asking.kind === "pgp") keepUnlocked(opened as PrivateKey);
        else keepSmimeOpen(opened as OwnSmime);
        asking.resolve(opened);
        setAsking(null);
      }}
      onCancel={() => {
        asking.reject(new Error(m.pgp_send_cancelled()));
        setAsking(null);
      }}
    />
  ) : null;

  return {
    available: !reason,
    reason,
    note,
    send,
    dialog,
    viaPgp,
    viaSmime,
    viaLink,
    linkDays,
    setLinkDays,
    signWith,
    sendSigned,
  };
};

type Asking = {
  kind: "pgp" | "smime";
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

const UnlockDialog = ({
  kind,
  unlock,
  onUnlocked,
  onCancel,
}: {
  kind: Asking["kind"];
  unlock: (secret: string) => Promise<unknown>;
  onUnlocked: (opened: unknown) => void;
  onCancel: () => void;
}) => {
  const [passphrase, setPassphrase] = useState("");
  const [wrong, setWrong] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      onUnlocked(await unlock(passphrase));
    } catch {
      setWrong(true);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onCancel()}
      title={m.pgp_unlock()}
      description={kind === "pgp" ? m.pgp_unlock_send_hint() : m.smime_unlock_send_hint()}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <Input
          type="password"
          autoFocus
          aria-label={kind === "pgp" ? m.pgp_unlock_passphrase() : m.smime_password()}
          placeholder={kind === "pgp" ? m.pgp_unlock_passphrase() : m.smime_password()}
          value={passphrase}
          onChange={(event) => {
            setPassphrase(event.target.value);
            setWrong(false);
          }}
        />
        {wrong ? (
          <span role="alert" className="text-[13px] text-danger">
            {kind === "pgp" ? m.pgp_wrong_passphrase() : m.smime_wrong_password()}
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
