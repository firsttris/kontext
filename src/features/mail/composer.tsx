/** Writing a mail: sender, recipients, subject, formatted text, attachments. */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ChevronLeft, Paperclip, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { displayBody, type OutgoingAttachment, saveDraft, sendEmail } from "@/jmap/mail";
import type { EmailAddress, Identity } from "@/jmap/types";
import { parseAddresses } from "@/lib/addresses";
import { type ComposeMode, startCompose } from "@/lib/compose";
import { formatSize } from "@/lib/format";
import { htmlToText, sanitizeMailHtml, textToHtml } from "@/lib/html";
import { contactAddresses } from "@/lib/jscontact";
import { findRole } from "@/lib/mailboxes";
import { m } from "@/paraglide/messages";
import { useContacts } from "../contacts/queries";
import { EditorToolbar } from "./editor-toolbar";
import { useEmail, useIdentities, useMailAccounts, useMailboxes } from "./queries";
import { RecipientField } from "./recipient-field";

type Props = {
  accountId: string;
  mode: ComposeMode;
  sourceEmailId?: string;
  prefillTo?: string;
};

/** The identity to send from: in a shared mailbox its address, else the login address. */
const defaultIdentity = (identities: Identity[], preferred: string): Identity | undefined =>
  identities.find((identity) => identity.email.toLowerCase() === preferred.toLowerCase()) ??
  identities[0];

export const Composer = ({ accountId, mode, sourceEmailId, prefillTo }: Props) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: session } = useSession();
  const accounts = useMailAccounts();
  const account = accounts.find((a) => a.id === accountId);
  const { data: identities = [] } = useIdentities(accountId);
  const { data: mailboxes = [] } = useMailboxes(accountId);
  const { data: contacts = [] } = useContacts();
  const source = useEmail(accountId, sourceEmailId);
  const suggestions = useMemo(() => contactAddresses(contacts), [contacts]);

  const [identityId, setIdentityId] = useState<string>("");
  const [to, setTo] = useState<EmailAddress[]>([]);
  const [cc, setCc] = useState<EmailAddress[]>([]);
  const [bcc, setBcc] = useState<EmailAddress[]>([]);
  const [showCopies, setShowCopies] = useState(false);
  const [subject, setSubject] = useState("");
  const [attachments, setAttachments] = useState<OutgoingAttachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [sending, setSending] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const initialized = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      Placeholder.configure({ placeholder: m.mail_body_placeholder() }),
    ],
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
  useEffect(() => {
    if (initialized.current || !editor || identities.length === 0) return;
    if (sourceEmailId && !source.data) return;
    initialized.current = true;
    const identity = defaultIdentity(
      identities,
      account?.isPersonal ? (session?.username ?? "") : (account?.name ?? ""),
    );
    if (identity) setIdentityId(identity.id);
    let originalHtml = "";
    if (source.data) {
      const body = displayBody(source.data);
      originalHtml = sanitizeMailHtml(body.kind === "html" ? body.value : textToHtml(body.value), {
        allowRemote: false,
        cidUrls: {},
      }).html;
    }
    const start = startCompose(mode, source.data, originalHtml, myAddresses);
    setTo(prefillTo ? parseAddresses(prefillTo).addresses : start.to);
    setCc(start.cc);
    if (start.cc.length) setShowCopies(true);
    setSubject(start.subject);
    setAttachments(start.forwardAttachments);
    const signature =
      identity?.htmlSignature ||
      (identity?.textSignature ? textToHtml(identity.textSignature) : "");
    editor.commands.setContent(`${signature ? `<p></p>${signature}` : ""}${start.html}`);
    editor.commands.focus("start");
  }, [
    editor,
    identities,
    source.data,
    sourceEmailId,
    mode,
    myAddresses,
    prefillTo,
    account,
    session?.username,
  ]);

  const identity = identities.find((i) => i.id === identityId);
  const drafts = findRole(mailboxes, "drafts");
  const sent = findRole(mailboxes, "sent");

  const close = () =>
    navigate({
      to: ".",
      search: (prev) => ({
        ...prev,
        compose: undefined,
        to: undefined,
        email: mode === "new" ? undefined : prev.email,
      }),
    });

  const outgoing = () => {
    const html = editor?.getHTML() ?? "";
    return {
      accountId,
      identity: identity!,
      to,
      cc,
      bcc,
      subject: subject.trim(),
      html,
      text: htmlToText(html),
      attachments,
      inReplyTo: mode === "reply" || mode === "replyAll" ? source.data?.messageId : null,
      references: mode === "reply" || mode === "replyAll" ? source.data?.references : null,
      draftId,
    };
  };

  const send = async () => {
    if (to.length + cc.length + bcc.length === 0) {
      toast.show(m.mail_recipients_missing(), "error");
      return;
    }
    if (!identity || !drafts || !sent) return;
    setSending(true);
    try {
      await sendEmail(client, outgoing(), { draftsId: drafts.id, sentId: sent.id });
      if (mode === "reply" || mode === "replyAll") {
        // RFC 8621: mark the original as answered.
        await client.call("Email/set", {
          accountId,
          update: { [sourceEmailId!]: { "keywords/$answered": true } },
        });
      }
      toast.show(m.mail_sent_toast());
      void queryClient.invalidateQueries({ queryKey: [accountId] });
      await close();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    } finally {
      setSending(false);
    }
  };

  const storeDraft = async () => {
    if (!identity || !drafts) return;
    try {
      setDraftId(await saveDraft(client, outgoing(), drafts.id));
      toast.show(m.mail_draft_saved());
      void queryClient.invalidateQueries({ queryKey: [accountId] });
      await close();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const { blobId, size } = await client.upload(
          accountId,
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
        <div className="flex flex-col border-b border-border px-3 py-1 text-[13px]">
          <div className="flex h-9 items-center gap-2.5">
            <span className="w-9 shrink-0 text-muted">{m.mail_from()}</span>
            <select
              aria-label={m.mail_from()}
              value={identityId}
              onChange={(e) => setIdentityId(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md border-0 bg-transparent text-[14px] text-fg"
            >
              {identities.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name && i.name !== i.email ? `${i.name} <${i.email}>` : i.email}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-start gap-2">
            <RecipientField
              label={m.mail_to()}
              value={to}
              onChange={setTo}
              suggestions={suggestions}
              autoFocus={mode === "new" || mode === "forward"}
            />
            {!showCopies ? (
              <button
                type="button"
                onClick={() => setShowCopies(true)}
                className="mt-2 shrink-0 text-[13px] text-muted hover:text-fg"
              >
                {m.mail_cc()} / {m.mail_bcc()}
              </button>
            ) : null}
          </div>
          {showCopies ? (
            <>
              <RecipientField
                label={m.mail_cc()}
                value={cc}
                onChange={setCc}
                suggestions={suggestions}
              />
              <RecipientField
                label={m.mail_bcc()}
                value={bcc}
                onChange={setBcc}
                suggestions={suggestions}
              />
            </>
          ) : null}
          <label className="flex h-9 items-center gap-2.5 border-t border-border">
            <span className="w-9 shrink-0 text-muted">{m.mail_subject()}</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              aria-label={m.mail_subject()}
              className="h-8 min-w-0 flex-1 border-0 bg-transparent text-[14px] text-fg outline-none"
            />
          </label>
        </div>
        {editor ? <EditorToolbar editor={editor} /> : null}
        <EditorContent
          editor={editor}
          className="editor-content min-h-[160px] flex-1 overflow-y-auto"
        />
        {attachments.length > 0 || uploading > 0 ? (
          <ul
            aria-label={m.mail_attachments()}
            className="m-0 flex list-none flex-wrap gap-2 border-t border-border p-2.5"
          >
            {attachments.map((file) => (
              <li
                key={file.blobId}
                className="flex items-center gap-2 rounded-lg border border-border py-1 pr-1 pl-2.5 text-[13px]"
              >
                <Paperclip size={13} className="text-muted" />
                <span className="max-w-[200px] truncate">{file.name}</span>
                <span className="text-muted">{formatSize(file.size)}</span>
                <button
                  type="button"
                  aria-label={`${file.name} entfernen`}
                  onClick={() => setAttachments((current) => current.filter((a) => a !== file))}
                  className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
            {uploading > 0 ? (
              <li className="px-2 py-1 text-[13px] text-muted">{m.common_loading()}</li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={sending || uploading > 0 || !identity}>
          <Send size={15} /> {sending ? m.mail_sending() : m.mail_send()}
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => void upload(e.target.files)}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label={m.mail_attach()}
          title={m.mail_attach()}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip size={16} />
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => void storeDraft()}>
          {m.mail_save_draft()}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={m.mail_discard()}
          title={m.mail_discard()}
          onClick={() => close()}
        >
          <Trash2 size={16} />
        </Button>
      </div>
    </form>
  );
};
