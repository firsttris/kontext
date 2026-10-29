/** Writing a mail: sender, recipients, subject, formatted text, attachments. */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import { ChevronLeft, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { AttachFromDocuments } from "@/features/documents/document-actions";
import { externalIdOf, replyingExternal, sendThroughExternal } from "@/features/external/api";
import {
  displayBody,
  draftParts,
  type OutgoingAttachment,
  saveDraft,
  sendEmail,
} from "@/jmap/mail";
import type { EmailAddress, Identity } from "@/jmap/types";
import { parseAddresses } from "@/lib/addresses";
import { attachmentMention, ownText } from "@/lib/attachment-reminder";
import { type ComposeMode, sharedSenderName, startCompose, startEmlForward } from "@/lib/compose";
import { savedBlobs, withSavedBlob } from "@/lib/draft-blobs";
import { htmlToText, sanitizeMailHtml, textToHtml } from "@/lib/html";
import { markCids } from "@/lib/inline-images";
import { withLegalFooter, withoutLegalFooter } from "@/lib/legal-footer";
import { findRole } from "@/lib/mailboxes";
import { pgpKind } from "@/lib/pgp-mail";
import { holdUntil, sendTimeLabel } from "@/lib/schedule";
import { signedOverEncrypted, smimeKind } from "@/lib/smime";
import { m } from "@/paraglide/messages";
import { useLegalFooter } from "../company/legal-footer";
import { useAddressSuggestions } from "../contacts/use-suggestions";
import { useAutocryptHeader } from "../pgp/autocrypt";
import { useEncryptedSend } from "../pgp/use-encrypted-send";
import { SnippetMenu } from "../snippets/snippet-menu";
import { AttachmentList, ComposerActions, ComposerFields } from "./composer-fields";
import { InsertImageButton, pictures, useComposerImages } from "./composer-images";
import { EditorToolbar } from "./editor-toolbar";
import { useExternalQuestion } from "./external-question";
import { ForgottenAttachment } from "./forgotten-attachment";
import { inlineParts, useInlineImageUrls } from "./inline-image-urls";
import { LegalFooterPreview } from "./legal-footer-preview";
import { type OpenedMail, openedMail, shownSubject } from "./opened-mails";
import { useEmail } from "./queries";
import { richText } from "./rich-text";
import { useUndoSeconds } from "./send-settings";
import { useTakeBack } from "./take-back";
import { useEmlForward } from "./use-eml-forward";
import { useSendAccount } from "./use-send-account";

/** What a new mail starts with from outside: a contact, a mailto: link, a share. */
export type ComposePrefill = {
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  files?: File[];
};

type Props = {
  accountId: string;
  mode: ComposeMode;
  sourceEmailId?: string;
  /** "Als Anhang weiterleiten" of several picked mails; else the source mail alone. */
  forwardIds?: string[];
  prefill?: ComposePrefill;
};

/** The identity to send from: in a shared mailbox its address, else the login address. */
const defaultIdentity = (identities: Identity[], preferred: string): Identity | undefined =>
  identities.find((identity) => identity.email.toLowerCase() === preferred.toLowerCase()) ??
  identities[0];

/** The sender's signature as HTML, as the composer puts it below the text. */
const signatureOf = (identity: Identity | undefined): string =>
  identity?.htmlSignature || (identity?.textSignature ? textToHtml(identity.textSignature) : "");

export const Composer = ({ accountId, mode, sourceEmailId, forwardIds, prefill }: Props) => {
  const prefillTo = prefill?.to;
  const client = useClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: session } = useSession();
  const { account, own, sendAccountId, identities, mailboxes, myName, sendersReady } =
    useSendAccount(accountId, true);
  // A mail forwarded as a file needs only its blob, not its content.
  const asEml = mode === "forwardEml";
  const source = useEmail(accountId, asEml ? undefined : sourceEmailId);
  const eml = useEmlForward(
    accountId,
    asEml ? (forwardIds ?? (sourceEmailId ? [sourceEmailId] : [])) : [],
  );
  const suggestions = useAddressSuggestions();

  const [identityId, setIdentityId] = useState<string>("");
  const [to, setTo] = useState<EmailAddress[]>([]);
  const [cc, setCc] = useState<EmailAddress[]>([]);
  const [bcc, setBcc] = useState<EmailAddress[]>([]);
  const [showCopies, setShowCopies] = useState(false);
  const [subject, setSubject] = useState("");
  const [attachments, setAttachments] = useState<OutgoingAttachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [sending, setSending] = useState(false);
  // "Anhang vergessen?": the word that asked, and when the mail was to go (now or later).
  const [forgotten, setForgotten] = useState<{ word: string; later?: Date } | null>(null);
  // "An externe Empfänger senden?": asked after "Anhang vergessen?", right before sending.
  const external = useExternalQuestion("mail");
  const undoSeconds = useUndoSeconds();
  const takeBack = useTakeBack();
  // A ref, not state: a send that waited for a running autosave must replace the draft that
  // save just wrote, not the one from before it.
  const draftId = useRef<string | null>(mode === "draft" ? (sourceEmailId ?? null) : null);
  const [threading, setThreading] = useState<{
    inReplyTo: string[] | null;
    references: string[] | null;
  }>({
    inReplyTo: null,
    references: null,
  });
  /** Bumped on every change; the autosave runs a moment after the last one. */
  const [changes, setChanges] = useState(0);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const initialized = useRef(false);
  // Pictures pasted or dropped into the text; set once the hook below has the editor.
  const insertPictures = useRef<(files: File[]) => void>(() => {});

  const editor = useEditor({
    extensions: [
      ...richText({ autolink: true, images: true }),
      Placeholder.configure({ placeholder: m.mail_body_placeholder() }),
    ],
    onUpdate: () => {
      if (initialized.current) setChanges((n) => n + 1);
    },
    editorProps: {
      handlePaste: (_view, event) => {
        const files = pictures(event.clipboardData?.files);
        if (!files.length) return false;
        insertPictures.current(files);
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        const files = moved ? [] : pictures(event.dataTransfer?.files);
        if (!files.length) return false;
        event.preventDefault();
        insertPictures.current(files);
        return true;
      },
      attributes: {
        "aria-label": m.mail_body_placeholder(),
        role: "textbox",
        "aria-multiline": "true",
      },
    },
  });

  const pics = useComposerImages({
    client,
    accountId: sendAccountId,
    editor,
    onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
    onBusy: (by) => setUploading((n) => n + by),
  });
  insertPictures.current = (files) => void pics.insert(files);
  // A draft's pictures, to show them again before its text goes into the editor.
  const draftImages = useInlineImageUrls(
    accountId,
    mode === "draft" ? (source.data ?? undefined) : undefined,
  );

  const myAddresses = useMemo(
    () =>
      [session?.username ?? "", ...identities.map((identity) => identity.email)].filter(Boolean),
    [session?.username, identities],
  );

  // Fill the form once the original (for reply/forward) and the identities are loaded.
  // A form hidden by a suspending route gets a new editor when it shows again; the effect still
  // holds the destroyed one then and waits for the render with the new one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once (initialized); toast and upload are only called
  useEffect(() => {
    if (initialized.current || !editor || editor.isDestroyed || identities.length === 0) return;
    if (!sendersReady) return;
    if (asEml ? !eml.data : sourceEmailId && !source.data) return;
    if (!draftImages.done) return;
    let originalHtml = "";
    // An encrypted original, opened here before: its real content (opened-mails.ts).
    let opened: OpenedMail | undefined;
    let encryptedOriginal = false;
    if (source.data) {
      const body = displayBody(source.data);
      // An encrypted original is quoted (and forwarded with its files) only as it was opened here,
      // never as cipher text; the answer goes encrypted too.
      if (
        pgpKind(source.data.contentType, body.value) === "encrypted" ||
        smimeKind(source.data.contentType) === "encrypted" ||
        signedOverEncrypted(source.data)
      ) {
        setEncrypt(true);
        encryptedOriginal = true;
        opened = openedMail(source.data.id);
        if (opened) {
          originalHtml = sanitizeMailHtml(opened.html ?? textToHtml(opened.text), {
            allowRemote: false,
            cidUrls: {},
          }).html;
        } else if (mode === "forward") {
          toast.show(m.mail_forward_encrypted_closed());
        }
      } else if (mode === "draft" && body.kind === "html") {
        // A draft keeps its pictures: shown from local URLs, marked with their Content-ID. A mail
        // taken back was sent with the Pflichtangaben; they go on again when it is sent.
        originalHtml = sanitizeMailHtml(markCids(withoutLegalFooter(body.value)), {
          allowRemote: false,
          cidUrls: draftImages.urls,
        }).html;
        pics.setImages(
          inlineParts(source.data).map((part) => ({
            blobId: part.blobId!,
            name: part.name ?? "bild",
            type: part.type,
            size: part.size,
            cid: part.cid!.replace(/^<|>$/g, ""),
          })),
        );
      } else {
        originalHtml = sanitizeMailHtml(
          body.kind === "html" ? body.value : textToHtml(body.value),
          {
            allowRemote: false,
            cidUrls: {},
          },
        ).html;
      }
    }
    // An encrypted original: "Re:" to its real subject, where it was opened (not to the stand-in).
    const original = source.data
      ? { ...source.data, subject: shownSubject(source.data) }
      : source.data;
    const start =
      mode === "forwardEml"
        ? startEmlForward(eml.data ?? [])
        : startCompose(mode, original, originalHtml, myAddresses);
    const answering = (mode === "reply" || mode === "replyAll") && source.data;
    const identity =
      (answering ? replyingExternal(identities, source.data!) : null) ??
      defaultIdentity(
        identities,
        start.from ??
          (sendAccountId !== accountId || account?.isPersonal
            ? (session?.username ?? "")
            : (account?.name ?? "")),
      );
    if (identity) setIdentityId(identity.id);
    // What the user typed while the identities were loading wins over the prefill.
    const keep =
      <T,>(prefill: T[]) =>
      (current: T[]) =>
        current.length ? current : prefill;
    setTo(keep(prefillTo ? parseAddresses(prefillTo).addresses : start.to));
    setCc(keep(prefill?.cc ? parseAddresses(prefill.cc).addresses : start.cc));
    setBcc(keep(start.bcc));
    if (start.cc.length || start.bcc.length || prefill?.cc) setShowCopies(true);
    setSubject((current) => current || prefill?.subject || start.subject);
    // The parts of an encrypted original are cipher text; its real files go along instead.
    setAttachments(encryptedOriginal ? [] : start.attachments);
    if (opened && mode === "forward") {
      void upload(
        opened.attachments.map(
          (file) =>
            new File([file.bytes as Uint8Array<ArrayBuffer>], file.name, { type: file.type }),
        ),
      );
    }
    setThreading({ inReplyTo: start.inReplyTo, references: start.references });
    // A draft already has its signature; a new mail gets the one of the sender.
    const signature = mode === "draft" ? "" : signatureOf(identity);
    const text = prefill?.body ? textToHtml(prefill.body) : "";
    editor.commands.setContent(`${text}${signature ? `<p></p>${signature}` : ""}${start.html}`);
    // Into the text – unless one is already typing elsewhere (e.g. the recipient).
    const active = document.activeElement;
    const typing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
    if (!typing) editor.commands.focus(mode === "draft" ? "end" : "start");
    initialized.current = true;
  }, [
    editor,
    identities,
    sendersReady,
    source.data,
    sourceEmailId,
    asEml,
    eml.data,
    mode,
    myAddresses,
    prefillTo,
    prefill?.cc,
    prefill?.subject,
    prefill?.body,
    account,
    session?.username,
    sendAccountId,
    accountId,
    draftImages,
  ]);

  const identity = identities.find((i) => i.id === identityId);
  const drafts = findRole(mailboxes, "drafts");
  const sent = findRole(mailboxes, "sent");

  const left = useRef(false);
  const leave = () => {
    left.current = true;
    return navigate({
      to: ".",
      search: (prev) => ({
        ...prev,
        compose: undefined,
        to: undefined,
        cc: undefined,
        subject: undefined,
        body: undefined,
        shared: undefined,
        emails: undefined,
        email: mode === "new" || mode === "draft" ? undefined : prev.email,
      }),
    });
  };

  const [receipt, setReceipt] = useState(false);
  const autocrypt = useAutocryptHeader(identity?.email);
  const [encrypt, setEncrypt] = useState(false);
  // Signed, not encrypted (an encrypted mail is signed anyway).
  const [sign, setSign] = useState(false);
  const pgp = useEncryptedSend(
    identity?.email,
    [...to, ...cc, ...bcc].map((address) => address.email),
  );
  const legalFooter = useLegalFooter();
  const outgoing = ({ draft = false } = {}) => {
    const { html, images } = pics.outgoing(editor?.getHTML() ?? "", { draft });
    return {
      accountId: sendAccountId,
      identity:
        sendAccountId === own?.id
          ? identity!
          : { ...identity!, name: sharedSenderName(myName, identity!.name) },
      to,
      cc,
      bcc,
      subject: subject.trim(),
      html,
      text: htmlToText(html),
      attachments,
      images,
      inReplyTo: threading.inReplyTo,
      references: threading.references,
      draftId: draftId.current,
      requestReceipt: receipt,
      autocrypt,
    };
  };

  const isEmpty = () =>
    to.length + cc.length + bcc.length === 0 &&
    !subject.trim() &&
    attachments.length === 0 &&
    pics.images.length === 0 &&
    !(editor?.getText().trim() ?? "");

  /** Saves the current state as the draft (replacing the previous one); one save at a time. */
  const autosave = async (): Promise<void> => {
    if (saving.current) await saving.current;
    // Once the form is left, what is still in the editor is no longer the mail: taking the editor
    // off the page drops its pictures (@tiptap/react resets the node views), and a save still
    // waiting would overwrite the draft just written.
    if (left.current) return;
    // An encrypted mail is not kept on the server unencrypted, not even as a draft.
    if (!identity || !drafts || isEmpty() || encrypt) return;
    const run = (async () => {
      const mail = outgoing({ draft: true });
      draftId.current = await saveDraft(client, mail, drafts.id);
      setSavedAt(new Date());
      // Files and pictures now live in the draft just written; the one replaced took its own.
      if (mail.attachments.length || mail.images.length) {
        const saved = savedBlobs(
          mail.attachments,
          mail.images,
          await draftParts(client, mail.accountId, draftId.current),
        );
        setAttachments((current) => current.map(withSavedBlob(saved)));
        pics.setImages((current) => current.map(withSavedBlob(saved)));
      }
      void queryClient.invalidateQueries({ queryKey: [sendAccountId, "emails"] });
    })();
    saving.current = run;
    try {
      await run;
    } finally {
      saving.current = null;
    }
  };

  // Autosave two seconds after the last change.
  const changeKey = `${changes}|${JSON.stringify([to, cc, bcc, subject, attachments.length, identityId])}`;
  const lastSaved = useRef(changeKey);
  useEffect(() => {
    if (!initialized.current || sending || changeKey === lastSaved.current) return;
    const timer = setTimeout(() => {
      lastSaved.current = changeKey;
      void autosave().catch(() => undefined);
    }, 2000);
    return () => clearTimeout(timer);
  });

  /** Closing keeps the work: unsaved changes are saved as a draft first. */
  const close = async () => {
    if (initialized.current && changeKey !== lastSaved.current && !isEmpty()) {
      lastSaved.current = changeKey;
      await autosave().catch(() => undefined);
    }
    await leave();
  };

  /** Throws the mail away, including its draft. */
  const discard = async () => {
    lastSaved.current = changeKey;
    if (saving.current) await saving.current;
    if (draftId.current) {
      await client
        .call("Email/set", { accountId: sendAccountId, destroy: [draftId.current] })
        .catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: [sendAccountId] });
    }
    await leave();
  };

  /**
   * Through another mailbox's server: saved as the draft, then sent by the Kontext server; the
   * draft stays the current one, so a failed send can simply be tried again. Returns the
   * recipients the provider turned down.
   */
  const sendExternal = async (
    externalId: string,
    mail: ReturnType<typeof outgoing>,
    folders: { draftsId: string; sentId: string },
  ) => {
    const emailId = await saveDraft(client, mail, folders.draftsId);
    draftId.current = emailId;
    return (await sendThroughExternal(externalId, { emailId, ...folders })).refused;
  };

  /**
   * Now (held for the seconds of "Rückgängig"), or `later` at that time. Asks first when the own
   * text speaks of an attachment and none is there, unless `withoutAttachment`; then, unless
   * `toOutside`, when recipients are outside the company (Hinweis „Extern“).
   */
  const send = async (later?: Date, withoutAttachment = false, toOutside = false) => {
    if (to.length + cc.length + bcc.length === 0) {
      toast.show(m.mail_recipients_missing(), "error");
      return;
    }
    const word =
      withoutAttachment || attachments.length
        ? undefined
        : attachmentMention(subject, ownText(editor?.getHTML() ?? "", signatureOf(identity)));
    if (word) {
      setForgotten({ word, later });
      return;
    }
    const outside = toOutside ? [] : external.outside([...to, ...cc, ...bcc].map((a) => a.email));
    if (outside.length) {
      external.ask(outside, () => void send(later, true, true));
      return;
    }
    if (!identity || !drafts || !sent) return;
    // Another mailbox sends at once through its own server: no holding back, no encrypting or
    // signing yet.
    const externalId = externalIdOf(identity);
    if (externalId && (later || encrypt || sign)) {
      toast.show(later ? m.external_no_later() : m.external_no_encrypt(), "error");
      return;
    }
    setSending(true);
    try {
      if (saving.current) await saving.current;
      const hold = externalId
        ? undefined
        : later
          ? { until: holdUntil(later) }
          : undoSeconds > 0
            ? { seconds: undoSeconds }
            : undefined;
      const folders = { draftsId: drafts.id, sentId: sent.id };
      // The Pflichtangaben go with the mail sent, never into a draft (autosave uses `outgoing`).
      const mail = withLegalFooter(outgoing(), legalFooter);
      const refused = externalId ? await sendExternal(externalId, mail, folders) : [];
      const held = externalId
        ? null
        : encrypt
          ? await pgp.send(mail, folders, hold)
          : sign
            ? await pgp.sendSigned(mail, folders, hold)
            : await sendEmail(client, mail, folders, hold);
      // Links and other mailboxes go out at once: nothing to take back, nothing held.
      const kept = held && !(encrypt && pgp.viaLink.length) ? held : null;
      if ((mode === "reply" || mode === "replyAll") && sourceEmailId) {
        // RFC 8621: mark the original as answered.
        // Mailboxes shared only for reading may not allow it; the mail is sent anyway.
        await client
          .call("Email/set", {
            accountId,
            update: { [sourceEmailId]: { "keywords/$answered": true } },
          })
          .catch(() => undefined);
      }
      lastSaved.current = changeKey;
      const back = {
        label: later ? m.mail_unsend() : m.mail_undo(),
        run: () => (kept ? takeBack(sendAccountId, kept, drafts.id) : Promise.resolve()),
      };
      if (!kept) {
        if (refused.length)
          toast.show(m.external_refused({ addresses: refused.join(", ") }), "error");
        else toast.show(externalId ? m.mail_sent_toast() : m.secure_sent_toast());
      } else if (later) {
        toast.show(m.mail_scheduled_toast({ when: sendTimeLabel(later) }), "info", {
          action: back,
          duration: 8000,
        });
      } else {
        toast.show(
          m.mail_sent_toast(),
          "info",
          hold ? { action: back, duration: undoSeconds * 1000 } : undefined,
        );
      }
      void queryClient.invalidateQueries({ queryKey: [accountId] });
      if (sendAccountId !== accountId)
        void queryClient.invalidateQueries({ queryKey: [sendAccountId] });
      await leave();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    } finally {
      setSending(false);
    }
  };

  const storeDraft = async () => {
    try {
      lastSaved.current = changeKey;
      await autosave();
      toast.show(m.mail_draft_saved());
      await leave();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  const upload = async (files: FileList | File[] | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const { blobId, size } = await client.upload(
          sendAccountId,
          file,
          file.type || "application/octet-stream",
        );
        setAttachments((current) => [
          ...current,
          { blobId, name: file.name, type: file.type || "application/octet-stream", size },
        ]);
      } catch (error) {
        toast.show(m.common_error({ message: (error as Error).message }), "error");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  // Files shared from another app become attachments once the form is filled (which sets the
  // attachments of a new mail to none) and the sender is known.
  const sharedUploaded = useRef(false);
  useEffect(() => {
    if (sharedUploaded.current || !initialized.current || !prefill?.files?.length) return;
    if (!sendAccountId) return;
    sharedUploaded.current = true;
    void upload(prefill.files);
  });

  return (
    <form
      aria-label={m.mail_compose()}
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
      // Strg+Enter (Cmd+Enter on a Mac) sends, as in Gmail and Outlook; only when "Senden" could.
      onKeyDown={(event) => {
        if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
        // Not from a dialog in a portal ("Später senden"): React passes its keys up to here too.
        if (!event.currentTarget.contains(event.target as Node)) return;
        const submit =
          event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (!submit || submit.disabled) return;
        event.preventDefault();
        submit.click();
      }}
      className="flex h-full min-h-0 flex-col gap-2.5 px-3 pt-2 pb-3 md:px-[18px] md:pt-3.5 md:pb-4"
    >
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={m.mail_back()}
          className="md:hidden"
          onClick={() => close()}
        >
          <ChevronLeft size={20} />
        </Button>
        <h2 className="m-0 flex-1 truncate text-[19px] font-semibold tracking-tight">
          {subject || (mode === "new" ? m.mail_compose() : m.mail_no_subject())}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label={m.common_close()}
          className="hidden md:inline-flex"
          onClick={() => close()}
        >
          <X size={16} />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border shadow-sm">
        <ComposerFields
          identities={identities}
          identityId={identityId}
          onIdentity={setIdentityId}
          to={to}
          onTo={setTo}
          cc={cc}
          onCc={setCc}
          bcc={bcc}
          onBcc={setBcc}
          showCopies={showCopies}
          onShowCopies={() => setShowCopies(true)}
          subject={subject}
          onSubject={setSubject}
          suggestions={suggestions}
          autoFocusTo={mode === "new" || mode === "forward" || asEml}
        />
        {editor ? (
          <EditorToolbar
            editor={editor}
            extra={
              <>
                <InsertImageButton onFiles={(files) => void pics.insert(files)} />
                <SnippetMenu editor={editor} accountId={sendAccountId} recipient={to[0]} />
              </>
            }
          />
        ) : null}
        <EditorContent
          editor={editor}
          className="editor-content min-h-[160px] flex-1 overflow-y-auto"
        />
        <LegalFooterPreview footer={legalFooter} />
        <AttachmentList
          attachments={attachments}
          uploading={uploading}
          onRemove={(file) => setAttachments((current) => current.filter((a) => a !== file))}
        />
      </div>

      <ComposerActions
        sending={sending}
        onSendLater={(at) => void send(at)}
        canSend={uploading === 0 && Boolean(identity && drafts && sent)}
        savedAt={savedAt}
        onAttach={(files) => void upload(files)}
        attachMore={
          <AttachFromDocuments
            accountId={sendAccountId}
            onAttached={(attachment) => setAttachments((current) => [...current, attachment])}
            onBusy={(change) => setUploading((n) => n + change)}
          />
        }
        onSaveDraft={() => void storeDraft()}
        receipt={receipt}
        onReceipt={setReceipt}
        encrypt={encrypt}
        onEncrypt={setEncrypt}
        encryptBlocked={pgp.reason}
        encryptNote={pgp.note}
        sign={sign}
        onSign={setSign}
        signWith={pgp.signWith}
        linkDays={pgp.viaLink.length ? pgp.linkDays : null}
        onLinkDays={pgp.setLinkDays}
        onDiscard={() => void discard()}
      />
      {pgp.dialog}
      {external.dialog}
      <ForgottenAttachment
        word={forgotten?.word ?? null}
        onAttach={(files) => void upload(files)}
        onSendAnyway={() => {
          const later = forgotten?.later;
          setForgotten(null);
          void send(later, true);
        }}
        onClose={() => setForgotten(null)}
      />
    </form>
  );
};
