/**
 * A mail shared as a copy: sending it (its content as a file, its attachments as files of the
 * message) and reading it from the card, for whoever cannot open the mailbox it lies in.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useClient } from "@/auth/auth";
import { useTheme } from "@/components/theme/use-theme";
import { Dialog } from "@/components/ui/dialog";
import type { EmailDetail } from "@/jmap/types";
import { MAIL_COPY_TYPE, type MailCopy } from "@/lib/chat";
import type { Card, ChatFile } from "@/lib/chat-cards";
import { mailDocument, sanitizeMailHtml, textToHtml } from "@/lib/html";
import { copyAttachments, copyFileName, mailCopyOf } from "@/lib/mail-copy";
import { m } from "@/paraglide/messages";
import { fileUrl, uploadFile } from "./upload";

/** Uploads the copy and the attachments into the channel; the card then points at the copy. */
export const useShareCopy = () => {
  const client = useClient();
  return async (
    channelId: string,
    accountId: string,
    email: EmailDetail,
    card: Card,
  ): Promise<{ card: Card; files: ChatFile[] }> => {
    const content = new File(
      [JSON.stringify(mailCopyOf(email))],
      copyFileName(email.subject ?? ""),
      {
        type: MAIL_COPY_TYPE,
      },
    );
    const copy = await uploadFile(channelId, content, { mailCopy: true });
    const files = await Promise.all(
      copyAttachments(email).map(async (part) => {
        const name = part.name ?? "Anhang";
        const blob = await client.download(accountId, part.blobId!, name, part.type);
        return uploadFile(channelId, new File([blob], name, { type: part.type }));
      }),
    );
    return { card: { ...card, copyId: copy.id }, files };
  };
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const MailCopyDialog = ({ copyId, onClose }: { copyId: string; onClose: () => void }) => {
  const dark = useTheme().theme === "dark";
  const { data: copy, isError } = useQuery({
    queryKey: ["chat", "copy", copyId],
    queryFn: async () => {
      const response = await fetch(fileUrl(copyId), { credentials: "same-origin" });
      if (!response.ok) throw new Error(String(response.status));
      return (await response.json()) as MailCopy;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
  // Cleaned here again: the copy is what a colleague uploaded. Pictures from the internet stay out.
  const document = useMemo(() => {
    if (!copy) return "";
    const source = copy.kind === "html" ? copy.body : textToHtml(copy.body);
    return mailDocument(
      sanitizeMailHtml(source, { allowRemote: false, cidUrls: {}, dark }).html,
      dark,
    );
  }, [copy, dark]);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={copy?.subject || m.mail_no_subject()}
      description={m.chat_copy_hint()}
      className="max-w-[760px]"
    >
      {isError ? <p className="m-0 text-[14px] text-muted">{m.chat_copy_gone()}</p> : null}
      {copy ? (
        <div className="flex min-h-0 flex-col gap-3">
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
            <dt className="text-muted">{m.chat_copy_from()}</dt>
            <dd className="m-0 break-words">{copy.from}</dd>
            <dt className="text-muted">{m.chat_copy_to()}</dt>
            <dd className="m-0 break-words">{copy.to}</dd>
            {copy.cc ? (
              <>
                <dt className="text-muted">{m.chat_copy_cc()}</dt>
                <dd className="m-0 break-words">{copy.cc}</dd>
              </>
            ) : null}
            <dt className="text-muted">{m.chat_copy_date()}</dt>
            <dd className="m-0">{when(copy.receivedAt)}</dd>
          </dl>
          <iframe
            title={m.mail_body_title()}
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            srcDoc={document}
            className="h-[min(60dvh,560px)] w-full rounded-lg border border-border bg-transparent"
          />
        </div>
      ) : null}
    </Dialog>
  );
};
