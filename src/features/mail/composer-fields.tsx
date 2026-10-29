/** The parts of the composer around the editor: header fields and attachments. */
import { Paperclip, X } from "lucide-react";
import type { OutgoingAttachment } from "@/jmap/mail";
import type { EmailAddress, Identity } from "@/jmap/types";
import { formatSize } from "@/lib/format";
import type { Suggestion } from "@/lib/groups";
import { m } from "@/paraglide/messages";
import { RecipientField } from "./recipient-field";

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
  replyTo: EmailAddress[];
  onReplyTo: (value: EmailAddress[]) => void;
  showReplyTo: boolean;
  onShowReplyTo: () => void;
  subject: string;
  onSubject: (value: string) => void;
  suggestions: Suggestion[];
  autoFocusTo: boolean;
};

const revealClass = "mt-2 shrink-0 text-[13px] text-muted hover:text-fg";

/** From, To, Cc/Bcc, „Antwort an“ (the last two shown when asked for) and subject. */
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
  replyTo,
  onReplyTo,
  showReplyTo,
  onShowReplyTo,
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
        <button type="button" onClick={onShowCopies} className={revealClass}>
          {m.mail_cc()} / {m.mail_bcc()}
        </button>
      ) : null}
      {!showReplyTo ? (
        <button type="button" onClick={onShowReplyTo} className={revealClass}>
          {m.mail_reply_to_field()}
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
    {showReplyTo ? (
      <RecipientField
        label={m.mail_reply_to_field()}
        value={replyTo}
        onChange={onReplyTo}
        suggestions={suggestions}
      />
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
