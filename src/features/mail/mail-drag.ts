/**
 * Drag and drop of mails from the list onto a folder or a mailbox in the sidebar. The drag carries
 * the mail and where it comes from; dropping moves it like "Verschieben nach …" does, also into
 * another mailbox. On a phone there is no dragging, the menu does the same.
 */
import { useNavigate } from "@tanstack/react-router";
import { type DragEvent, useState } from "react";
import { useToast } from "@/components/ui/toast";
import type { EmailSummary } from "@/jmap/types";
import { m } from "@/paraglide/messages";
import { useMoveTo } from "./actions";

const TYPE = "application/x-sekretaer-mail";

export type DraggedMail = { accountId: string; from: string; email: EmailSummary };

export const startMailDrag = (event: DragEvent, mail: DraggedMail) => {
  event.dataTransfer.setData(TYPE, JSON.stringify(mail));
  event.dataTransfer.effectAllowed = "move";
};

const readMailDrag = (event: DragEvent): DraggedMail | undefined => {
  const data = event.dataTransfer.getData(TYPE);
  return data ? (JSON.parse(data) as DraggedMail) : undefined;
};

type Target = { accountId: string; mailboxId: string };

/**
 * Props that make an element a drop target. While a mail is over it, it carries `data-drop-over`
 * for the highlight.
 */
export const useMailDrop = () => {
  const moveTo = useMoveTo();
  const toast = useToast();
  const navigate = useNavigate();
  const [over, setOver] = useState<string | null>(null);

  const drop = async (mail: DraggedMail, target: Target, name: string) => {
    if (mail.accountId === target.accountId && mail.from === target.mailboxId) return;
    // The moved mail may be the open one; it is gone from here, so the pane closes.
    void navigate({
      to: ".",
      search: (prev) =>
        prev.email === mail.email.id ? { ...prev, email: undefined, account: undefined } : prev,
    });
    try {
      await moveTo.mutateAsync({ ...mail, emails: [mail.email], target });
      toast.show(m.mail_moved({ folder: name }));
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (target: Target, name: string) => {
    const key = `${target.accountId}/${target.mailboxId}`;
    return {
      "data-drop-over": over === key ? "" : undefined,
      onDragOver: (event: DragEvent) => {
        if (!event.dataTransfer.types.includes(TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(key);
      },
      onDragLeave: () => setOver((current) => (current === key ? null : current)),
      onDrop: (event: DragEvent) => {
        setOver(null);
        const mail = readMailDrag(event);
        if (!mail) return;
        event.preventDefault();
        void drop(mail, target, name);
      },
    };
  };
};
