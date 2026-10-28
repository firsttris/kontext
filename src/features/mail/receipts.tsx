/**
 * Read receipts: the line at a mail whose sender asks for one ("Senden" / "Nicht senden"), and at
 * a mail one sent with the request, who has confirmed it (src/lib/mdn.ts).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { useClient } from "@/auth/auth";
import { useToast } from "@/components/ui/toast";
import { CAPABILITIES, type JmapClient } from "@/jmap/client";
import { setKeyword } from "@/jmap/mail";
import type { EmailAddress, EmailDetail } from "@/jmap/types";
import { displayName } from "@/lib/format";
import { LOCALE } from "@/lib/locale";
import { findRole } from "@/lib/mailboxes";
import { isReceipt, MDN_SENT, receiptAnswered, receiptMessage } from "@/lib/mdn";
import { m } from "@/paraglide/messages";
import { useSendAccount } from "./use-send-account";

const line =
  "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2 text-[13px]";

/** The receipt as a raw message: uploaded, put into Sent, sent to who asked. */
const sendReceipt = async (
  client: JmapClient,
  accountId: string,
  identityId: string,
  sentId: string,
  raw: string,
  to: string,
  from: string,
) => {
  const { blobId } = await client.upload(accountId, raw, "message/rfc822");
  const [imported] = await client.request([
    [
      "Email/import",
      {
        accountId,
        emails: { r: { blobId, mailboxIds: { [sentId]: true }, keywords: { $seen: true } } },
      },
      "i",
    ],
  ]);
  const emailId = (imported![1] as { created?: Record<string, { id: string }> }).created?.r?.id;
  if (!emailId) throw new Error(m.mail_receipt_failed());
  const [submitted] = await client.request(
    [
      [
        "EmailSubmission/set",
        {
          accountId,
          create: {
            s: {
              identityId,
              emailId,
              envelope: { mailFrom: { email: from }, rcptTo: [{ email: to }] },
            },
          },
        },
        "s",
      ],
    ],
    [CAPABILITIES.core, CAPABILITIES.mail, CAPABILITIES.submission],
  );
  if (!(submitted![1] as { created?: object }).created) throw new Error(m.mail_receipt_failed());
};

/** At a mail whose sender asks for a receipt, until it is sent or declined. */
export const ReceiptRequest = ({ accountId, email }: { accountId: string; email: EmailDetail }) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const toast = useToast();
  const send = useSendAccount(accountId);
  const [busy, setBusy] = useState(false);
  const asker = email.receiptTo?.[0];
  const own = send.identities.map((identity) => identity.email.toLowerCase());
  if (!asker || receiptAnswered(email.keywords) || own.includes(asker.email.toLowerCase())) {
    return null;
  }

  const answer = async (confirm: boolean) => {
    setBusy(true);
    try {
      if (confirm) {
        const to = [...(email.to ?? []), ...(email.cc ?? [])].map((a) => a.email.toLowerCase());
        const identity =
          send.identities.find((candidate) => to.includes(candidate.email.toLowerCase())) ??
          send.identities[0];
        const sent = findRole(send.mailboxes, "sent");
        if (!identity || !sent) throw new Error(m.mail_receipt_failed());
        const raw = receiptMessage({
          from: { name: identity.name || null, email: identity.email },
          to: asker,
          original: {
            messageId: email.messageId?.[0] ?? email.id,
            subject: email.subject ?? "",
            sentAt: email.sentAt ?? email.receivedAt,
          },
          now: new Date(),
          id: crypto.randomUUID(),
        });
        await sendReceipt(
          client,
          send.sendAccountId,
          identity.id,
          sent.id,
          raw,
          asker.email,
          identity.email,
        );
      }
      // Declined counts as answered too: nobody is asked again.
      await setKeyword(client, accountId, [email.id], MDN_SENT, true);
      await queryClient.invalidateQueries({ queryKey: [accountId] });
      if (confirm) toast.show(m.mail_receipt_sent({ name: displayName(asker) }));
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    } finally {
      setBusy(false);
    }
  };

  const button = "text-[12px] font-medium underline-offset-2 hover:underline disabled:opacity-50";
  return (
    <div role="note" className={line}>
      <MailCheck size={15} className="text-accent" aria-hidden="true" />
      <span className="flex-1">{m.mail_receipt_asked({ name: displayName(asker) })}</span>
      <button type="button" className={button} disabled={busy} onClick={() => void answer(true)}>
        {m.mail_receipt_send()}
      </button>
      <button
        type="button"
        className={`${button} text-muted`}
        disabled={busy}
        onClick={() => void answer(false)}
      >
        {m.mail_receipt_decline()}
      </button>
    </div>
  );
};

type Confirmation = {
  from: EmailAddress[] | null;
  receivedAt: string;
  inReplyTo: string[] | null;
  references: string[] | null;
  "header:Content-Type": string | null;
};

/**
 * The receipts for a mail: Stalwart does not search In-Reply-To, so mails with its subject are
 * asked for ("Gelesen: …" carries it) and those kept that are receipts and point at this mail.
 */
const confirmations = async (
  client: JmapClient,
  accountId: string,
  messageId: string,
  subject: string,
) => {
  const [, got] = await client.request([
    ["Email/query", { accountId, filter: { subject }, limit: 50 }, "q"],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        // Raw is the default form; Stalwart answers under this name either way.
        properties: ["from", "receivedAt", "inReplyTo", "references", "header:Content-Type"],
      },
      "g",
    ],
  ]);
  return ((got![1] as { list?: Confirmation[] }).list ?? []).filter(
    (mail) =>
      isReceipt(mail["header:Content-Type"]) &&
      [...(mail.inReplyTo ?? []), ...(mail.references ?? [])].includes(messageId),
  );
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(LOCALE, {
    timeZone: "Europe/Berlin",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** At a mail one sent asking for receipts: who confirmed it, and when. */
export const ReceiptsReceived = ({
  accountId,
  email,
}: {
  accountId: string;
  email: EmailDetail;
}) => {
  const client = useClient();
  const messageId = email.messageId?.[0];
  const asked = Boolean(email.receiptTo?.length && messageId);
  const { data = [] } = useQuery({
    // Under the account: a receipt arriving refreshes it.
    queryKey: [accountId, "emails", "receipts", messageId],
    queryFn: () => confirmations(client, accountId, messageId!, email.subject ?? ""),
    enabled: asked,
  });
  if (!asked) return null;
  return (
    <div role="note" className={line}>
      <MailCheck size={15} className={data.length ? "text-ok" : "text-muted"} aria-hidden="true" />
      <span className="text-muted">
        {data.length
          ? data
              .map((receipt) =>
                m.mail_receipt_by({
                  name: displayName(receipt.from?.[0]),
                  when: when(receipt.receivedAt),
                }),
              )
              .join(" · ")
          : m.mail_receipt_waiting()}
      </span>
    </div>
  );
};
