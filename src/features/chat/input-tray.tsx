/** What goes with the message being written, above the field: photos, files and cards. */
import { FileText, LoaderCircle, X } from "lucide-react";
import { m } from "@/paraglide/messages";
import { MessageCard } from "./message-card";
import type { Attachments } from "./use-attachments";

export const InputTray = ({ attachments }: { attachments: Attachments }) => {
  const { cards, removeFile, removeCard } = attachments;
  const files = attachments.files.filter((file) => !file.quiet);
  if (!files.length && !cards.length) return null;
  return (
    <section
      aria-label={m.chat_attached()}
      className="flex flex-col gap-2 px-1 pb-2 md:px-3 md:pt-3 md:pb-0"
    >
      {files.length ? (
        <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0">
          {files.map((file) => (
            <li key={file.key} className="relative shrink-0">
              {file.preview ? (
                <img
                  src={file.preview}
                  alt={file.name}
                  className="size-16 rounded-lg border border-border object-cover"
                />
              ) : (
                <span className="flex h-16 w-36 items-center gap-2 rounded-lg border border-border px-2 text-[12px]">
                  <FileText size={16} className="shrink-0 text-muted" aria-hidden="true" />
                  <span className="line-clamp-2 break-all">{file.name}</span>
                </span>
              )}
              {file.uploaded ? null : (
                <span
                  role="status"
                  aria-label={m.chat_uploading({ name: file.name })}
                  className="absolute inset-0 flex items-center justify-center rounded-lg bg-bg/60"
                >
                  <LoaderCircle size={18} className="animate-spin text-muted" aria-hidden="true" />
                </span>
              )}
              <button
                type="button"
                aria-label={m.chat_file_remove({ name: file.name })}
                onClick={() => removeFile(file.key)}
                className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-onprimary"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {cards.map((card) => (
        <MessageCard
          key={`${card.kind}-${card.ref}`}
          card={card}
          onRemove={() => removeCard(card)}
        />
      ))}
    </section>
  );
};
