/**
 * "Abbestellen" at a newsletter: with one click through Kontext's server (RFC 8058), by a mail to
 * the list, or on the sender's page. The mail remembers it was unsubscribed (UNSUBSCRIBED) and
 * may go to the bin right after.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useClient } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { sendEmail, setKeyword } from "@/jmap/mail";
import type { EmailDetail } from "@/jmap/types";
import { displayName } from "@/lib/format";
import { findRole } from "@/lib/mailboxes";
import { m } from "@/paraglide/messages";
import { unsubscribeWay } from "../../../server/unsubscribe/unsubscribe";
import { useEmailActions } from "./actions";
import { useSendAccount } from "./use-send-account";

/** Kept on the mail once one unsubscribed from it. */
export const UNSUBSCRIBED = "kontext.unsubscribed";

const oneClick = async (accountId: string, emailId: string) => {
  const response = await fetch("/api/unsubscribe", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId, emailId }),
  });
  const result = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
};

export const UnsubscribeButton = ({
  accountId,
  mailboxId,
  email,
}: {
  accountId: string;
  mailboxId: string;
  email: EmailDetail;
}) => {
  const way = unsubscribeWay(email.unsubscribe, email.unsubscribePost);
  const [open, setOpen] = useState(false);
  if (!way) return null;
  if (email.keywords[UNSUBSCRIBED]) {
    return <span className="text-[12px] text-muted">{m.mail_unsubscribed()}</span>;
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] text-muted underline decoration-dotted underline-offset-2 hover:text-fg"
      >
        {m.mail_unsubscribe()}
      </button>
      {open ? (
        <UnsubscribeDialog
          accountId={accountId}
          mailboxId={mailboxId}
          email={email}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
};

const UnsubscribeDialog = ({
  accountId,
  mailboxId,
  email,
  onClose,
}: {
  accountId: string;
  mailboxId: string;
  email: EmailDetail;
  onClose: () => void;
}) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const toast = useToast();
  const actions = useEmailActions(accountId);
  const navigate = useNavigate();
  const send = useSendAccount(accountId);
  const way = unsubscribeWay(email.unsubscribe, email.unsubscribePost)!;
  const sender = displayName(email.from?.[0]);
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  /** From the address the newsletter came to, so the right subscription ends. */
  const identity = () => {
    const to = [...(email.to ?? []), ...(email.cc ?? [])].map((a) => a.email.toLowerCase());
    return (
      send.identities.find((candidate) => to.includes(candidate.email.toLowerCase())) ??
      send.identities[0]
    );
  };

  const unsubscribe = async () => {
    setBusy(true);
    try {
      if (way.kind === "one-click") await oneClick(accountId, email.id);
      if (way.kind === "web") window.open(way.url, "_blank", "noopener,noreferrer");
      if (way.kind === "mail") {
        const from = identity();
        const drafts = findRole(send.mailboxes, "drafts");
        const sent = findRole(send.mailboxes, "sent");
        if (!from || !drafts || !sent) throw new Error(m.mail_unsubscribe_no_identity());
        await sendEmail(
          client,
          {
            accountId: send.sendAccountId,
            identity: from,
            to: [{ name: null, email: way.to }],
            cc: [],
            bcc: [],
            subject: way.subject,
            html: "",
            text: way.body,
            attachments: [],
          },
          { draftsId: drafts.id, sentId: sent.id },
        );
      }
      await setKeyword(client, accountId, [email.id], UNSUBSCRIBED, true);
      if (remove) {
        await navigate({ to: ".", search: (prev) => ({ ...prev, email: undefined }) });
        await actions.remove([email.id], mailboxId);
      }
      await queryClient.invalidateQueries({ queryKey: [accountId] });
      toast.show(
        way.kind === "web" ? m.mail_unsubscribe_web_done() : m.mail_unsubscribe_done({ sender }),
      );
      onClose();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(value) => !value && onClose()}
      title={m.mail_unsubscribe_title({ sender })}
      description={
        way.kind === "one-click"
          ? m.mail_unsubscribe_one_click({ sender })
          : way.kind === "mail"
            ? m.mail_unsubscribe_mail({ address: way.to })
            : m.mail_unsubscribe_web()
      }
    >
      <label className="flex items-center gap-2.5 text-[14px]">
        <input
          type="checkbox"
          checked={remove}
          onChange={(event) => setRemove(event.target.checked)}
          className="size-4 accent-[var(--primary)]"
        />
        {m.mail_unsubscribe_delete()}
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {m.tasks_cancel()}
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void unsubscribe()}>
          {m.mail_unsubscribe()}
        </Button>
      </div>
    </Dialog>
  );
};
