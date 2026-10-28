/** The parts of the composer around the editor: header fields, attachments, action bar. */
import {
  LockKeyhole,
  LockKeyholeOpen,
  MailCheck,
  Paperclip,
  Send,
  Signature,
  Trash2,
  X,
} from "lucide-react";
import { type ReactNode, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { OutgoingAttachment } from "@/jmap/mail";
import type { EmailAddress, Identity } from "@/jmap/types";
import { formatSize } from "@/lib/format";
import type { Suggestion } from "@/lib/groups";
import { m } from "@/paraglide/messages";
import { LINK_DAY_CHOICES } from "../pgp/use-encrypted-send";
import { RecipientField } from "./recipient-field";
import { SendLater } from "./send-later";

type FieldsProps = {
  identities: Identity[];
  identityId: string;
  onIdentity: (id: string) => void;
  to: EmailAddress[];
  onTo: (value: EmailAddress[]) => void;
  cc: EmailAddress[];
  onCc: (value: EmailAddress[]) => void;
  bcc: EmailAddress[];
  onBcc: (value: EmailAddress[]) => void;
  showCopies: boolean;
  onShowCopies: () => void;
  subject: string;
  onSubject: (value: string) => void;
  suggestions: Suggestion[];
  autoFocusTo: boolean;
};

/** From, To, Cc/Bcc and subject. */
export const ComposerFields = ({
  identities,
  identityId,
  onIdentity,
  to,
  onTo,
  cc,
  onCc,
  bcc,
  onBcc,
  showCopies,
  onShowCopies,
  subject,
  onSubject,
  suggestions,
  autoFocusTo,
}: FieldsProps) => (
  <div className="flex flex-col border-b border-border px-3 py-1 text-[13px]">
    <div className="flex h-9 items-center gap-2.5">
      <span className="w-9 shrink-0 text-muted">{m.mail_from()}</span>
      <select
        aria-label={m.mail_from()}
        value={identityId}
        onChange={(e) => onIdentity(e.target.value)}
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
        onChange={onTo}
        suggestions={suggestions}
        autoFocus={autoFocusTo}
      />
      {!showCopies ? (
        <button
          type="button"
          onClick={onShowCopies}
          className="mt-2 shrink-0 text-[13px] text-muted hover:text-fg"
        >
          {m.mail_cc()} / {m.mail_bcc()}
        </button>
      ) : null}
    </div>
    {showCopies ? (
      <>
        <RecipientField label={m.mail_cc()} value={cc} onChange={onCc} suggestions={suggestions} />
        <RecipientField
          label={m.mail_bcc()}
          value={bcc}
          onChange={onBcc}
          suggestions={suggestions}
        />
      </>
    ) : null}
    <label className="flex h-9 items-center gap-2.5 border-t border-border">
      <span className="w-9 shrink-0 text-muted">{m.mail_subject()}</span>
      <input
        value={subject}
        onChange={(e) => onSubject(e.target.value)}
        aria-label={m.mail_subject()}
        className="h-8 min-w-0 flex-1 border-0 bg-transparent text-[14px] text-fg outline-none"
      />
    </label>
  </div>
);

/** The attached files, each with a button to remove it. */
export const AttachmentList = ({
  attachments,
  uploading,
  onRemove,
}: {
  attachments: OutgoingAttachment[];
  uploading: number;
  onRemove: (file: OutgoingAttachment) => void;
}) =>
  attachments.length > 0 || uploading > 0 ? (
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
            aria-label={m.mail_attachment_remove({ name: file.name })}
            onClick={() => onRemove(file)}
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
  ) : null;

/** Send, attach, the autosave note, save as draft and discard. */
export const ComposerActions = ({
  sending,
  canSend,
  onSendLater,
  savedAt,
  onAttach,
  attachMore,
  onSaveDraft,
  onDiscard,
  receipt,
  onReceipt,
  encrypt,
  onEncrypt,
  encryptBlocked,
  encryptNote,
  linkDays,
  onLinkDays,
  sign,
  onSign,
  signWith,
}: {
  receipt: boolean;
  onReceipt: (on: boolean) => void;
  encrypt: boolean;
  onEncrypt: (on: boolean) => void;
  /** Why it cannot be encrypted now, or null. */
  encryptBlocked: string | null;
  /** What happens to whom when sent confidentially. */
  encryptNote: string;
  /** How long the links of "Vertraulich senden" stay; null when no one gets a link. */
  linkDays: number | null;
  onLinkDays: (days: number) => void;
  /** Signed only, not encrypted; with what (null: no key or certificate for this address). */
  sign: boolean;
  onSign: (on: boolean) => void;
  signWith: "smime" | "pgp" | null;
  sending: boolean;
  canSend: boolean;
  onSendLater: (at: Date) => void;
  savedAt: Date | null;
  onAttach: (files: FileList | null) => void;
  /** Further ways to attach, beside the file picker (from Dokumente). */
  attachMore?: ReactNode;
  onSaveDraft: () => void;
  onDiscard: () => void;
}) => {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <span className="flex">
        <Button
          type="submit"
          variant="primary"
          disabled={sending || !canSend}
          className="rounded-r-none"
        >
          <Send size={15} /> {sending ? m.mail_sending() : m.mail_send()}
        </Button>
        <SendLater disabled={sending || !canSend} onPick={onSendLater} />
      </span>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => onAttach(e.target.files)}
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
      {attachMore}
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.mail_receipt_request()}
        title={m.mail_receipt_request()}
        aria-pressed={receipt}
        onClick={() => onReceipt(!receipt)}
        className={receipt ? "bg-accent/10 text-accent-ink hover:bg-accent/15" : undefined}
      >
        <MailCheck size={16} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.pgp_send_toggle()}
        title={
          encrypt
            ? (encryptBlocked ?? `${encryptNote} ${m.pgp_send_draft_hint()}`)
            : m.pgp_send_toggle()
        }
        aria-pressed={encrypt}
        onClick={() => onEncrypt(!encrypt)}
        className={
          encrypt
            ? encryptBlocked
              ? "bg-warn/10 text-warn hover:bg-warn/15"
              : "bg-accent/10 text-accent-ink hover:bg-accent/15"
            : undefined
        }
      >
        {encrypt ? <LockKeyhole size={16} /> : <LockKeyholeOpen size={16} />}
      </Button>
      {!encrypt && signWith ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={m.sign_toggle()}
          title={
            sign ? (signWith === "smime" ? m.sign_on_smime() : m.sign_on_pgp()) : m.sign_toggle()
          }
          aria-pressed={sign}
          onClick={() => onSign(!sign)}
          className={sign ? "bg-accent/10 text-accent-ink hover:bg-accent/15" : undefined}
        >
          <Signature size={16} />
        </Button>
      ) : null}
      {!encrypt && sign && signWith ? (
        <span role="status" className="hidden min-w-0 truncate text-[12px] text-accent sm:inline">
          {signWith === "smime" ? m.sign_on_smime() : m.sign_on_pgp()}
        </span>
      ) : null}
      {encrypt ? (
        <span
          role="status"
          className={`hidden min-w-0 truncate text-[12px] sm:inline ${encryptBlocked ? "text-warn" : "text-accent"}`}
        >
          {encryptBlocked ?? encryptNote}
        </span>
      ) : null}
      {encrypt && !encryptBlocked && linkDays !== null ? (
        <select
          aria-label={m.secure_link_days()}
          title={m.secure_link_days()}
          value={linkDays}
          onChange={(event) => onLinkDays(Number(event.target.value))}
          className="h-8 rounded-lg border border-border bg-bg px-2 text-[12px] text-fg"
        >
          {LINK_DAY_CHOICES.map((days) => (
            <option key={days} value={days}>
              {m.secure_link_days_option({ days })}
            </option>
          ))}
        </select>
      ) : null}
      <div className="flex-1" />
      {savedAt ? (
        <span role="status" className="hidden text-[12px] text-muted sm:inline">
          {m.mail_draft_autosaved({
            time: savedAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
          })}
        </span>
      ) : null}
      <Button variant="ghost" size="sm" onClick={onSaveDraft}>
        {m.mail_save_draft()}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.mail_discard()}
        title={m.mail_discard()}
        onClick={onDiscard}
      >
        <Trash2 size={16} />
      </Button>
    </div>
  );
};
