/** Writing a mail: sender, recipients, subject, formatted text, attachments. */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ChevronLeft, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { displayBody, type OutgoingAttachment, saveDraft, sendEmail } from "@/jmap/mail";
import type { EmailAddress, Identity } from "@/jmap/types";
import { parseAddresses } from "@/lib/addresses";
import { type ComposeMode, sharedSenderName, startCompose } from "@/lib/compose";
import { groupSuggestions } from "@/lib/groups";
import { htmlToText, sanitizeMailHtml, textToHtml } from "@/lib/html";
import { contactAddresses } from "@/lib/jscontact";
import { findRole } from "@/lib/mailboxes";
import { holdUntil, sendTimeLabel } from "@/lib/schedule";
import { m } from "@/paraglide/messages";
import { useContacts } from "../contacts/queries";
import { SnippetMenu } from "../snippets/snippet-menu";
import { AttachmentList, ComposerActions, ComposerFields } from "./composer-fields";
import { EditorToolbar } from "./editor-toolbar";
import { useEmail } from "./queries";
import { useUndoSeconds } from "./send-settings";
import { useTakeBack } from "./take-back";
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
  prefill?: ComposePrefill;
};

/** The identity to send from: in a shared mailbox its address, else the login address. */
const defaultIdentity = (identities: Identity[], preferred: string): Identity | undefined =>
  identities.find((identity) => identity.email.toLowerCase() === preferred.toLowerCase()) ??
  identities[0];

export const Composer = ({ accountId, mode, sourceEmailId, prefill }: Props) => {
  const prefillTo = prefill?.to;
  const client = useClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: session } = useSession();
  const { account, own, sendAccountId, identities, mailboxes, myName } = useSendAccount(accountId);
  const { data: contacts = [] } = useContacts();
  const source = useEmail(accountId, sourceEmailId);
  const suggestions = useMemo(
    () => [...groupSuggestions(contacts), ...contactAddresses(contacts)],
    [contacts],
  );

  const [identityId, setIdentityId] = useState<string>("");
  const [to, setTo] = useState<EmailAddress[]>([]);
  const [cc, setCc] = useState<EmailAddress[]>([]);
  const [bcc, setBcc] = useState<EmailAddress[]>([]);
  const [showCopies, setShowCopies] = useState(false);
  const [subject, setSubject] = useState("");
  const [attachments, setAttachments] = useState<OutgoingAttachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [sending, setSending] = useState(false);
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      Placeholder.configure({ placeholder: m.mail_body_placeholder() }),
    ],
    onUpdate: () => {
      if (initialized.current) setChanges((n) => n + 1);
    },
    editorProps: {
      attributes: {
        "aria-label": m.mail_body_placeholder(),
        role: "textbox",
        "aria-multiline": "true",
      },
    },
  });

  const myAddresses = useMemo(
    () =>
      [session?.username ?? "", ...identities.map((identity) => identity.email)].filter(Boolean),
    [session?.username, identities],
  );

  // Fill the form once the original (for reply/forward) and the identities are loaded.
  // A form hidden by a suspending route gets a new editor when it shows again; the effect still
  // holds the destroyed one then and waits for the render with the new one.
  useEffect(() => {
    if (initialized.current || !editor || editor.isDestroyed || identities.length === 0) return;
    if (sourceEmailId && !source.data) return;
    let originalHtml = "";
    if (source.data) {
      const body = displayBody(source.data);
      originalHtml = sanitizeMailHtml(body.kind === "html" ? body.value : textToHtml(body.value), {
        allowRemote: false,
        cidUrls: {},
      }).html;
    }
    const start = startCompose(mode, source.data, originalHtml, myAddresses);
    const identity = defaultIdentity(
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
    setAttachments(start.attachments);
    setThreading({ inReplyTo: start.inReplyTo, references: start.references });
    // A draft already has its signature; a new mail gets the one of the sender.
    const signature =
      mode === "draft"
        ? ""
        : identity?.htmlSignature ||
          (identity?.textSignature ? textToHtml(identity.textSignature) : "");
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
    source.data,
    sourceEmailId,
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
  ]);

  const identity = identities.find((i) => i.id === identityId);
  const drafts = findRole(mailboxes, "drafts");
  const sent = findRole(mailboxes, "sent");

  const leave = () =>
    navigate({
      to: ".",
      search: (prev) => ({
        ...prev,
        compose: undefined,
        to: undefined,
        cc: undefined,
        subject: undefined,
        body: undefined,
        shared: undefined,
        email: mode === "new" || mode === "draft" ? undefined : prev.email,
      }),
    });

  const outgoing = () => {
    const html = editor?.getHTML() ?? "";
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
      inReplyTo: threading.inReplyTo,
      references: threading.references,
      draftId: draftId.current,
    };
  };

  const isEmpty = () =>
    to.length + cc.length + bcc.length === 0 &&
    !subject.trim() &&
    attachments.length === 0 &&
    !(editor?.getText().trim() ?? "");

  /** Saves the current state as the draft (replacing the previous one); one save at a time. */
  const autosave = async (): Promise<void> => {
    if (saving.current) await saving.current;
    if (!identity || !drafts || isEmpty()) return;
    const run = (async () => {
      draftId.current = await saveDraft(client, outgoing(), drafts.id);
      setSavedAt(new Date());
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

  /** Now (held for the seconds of "Rückgängig"), or `later` at that time. */
  const send = async (later?: Date) => {
    if (to.length + cc.length + bcc.length === 0) {
      toast.show(m.mail_recipients_missing(), "error");
      return;
    }
    if (!identity || !drafts || !sent) return;
    setSending(true);
    try {
      if (saving.current) await saving.current;
      const hold = later
        ? { until: holdUntil(later) }
        : undoSeconds > 0
          ? { seconds: undoSeconds }
          : undefined;
      const held = await sendEmail(
        client,
        outgoing(),
        { draftsId: drafts.id, sentId: sent.id },
        hold,
      );
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
        run: () => takeBack(sendAccountId, held, drafts.id),
      };
      if (later) {
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
          autoFocusTo={mode === "new" || mode === "forward"}
        />
        {editor ? (
          <EditorToolbar
            editor={editor}
            extra={<SnippetMenu editor={editor} accountId={sendAccountId} recipient={to[0]} />}
          />
        ) : null}
        <EditorContent
          editor={editor}
          className="editor-content min-h-[160px] flex-1 overflow-y-auto"
        />
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
        onSaveDraft={() => void storeDraft()}
        onDiscard={() => void discard()}
      />
    </form>
  );
};
