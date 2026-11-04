/**
 * „Als Phishing melden“ in the reading pane: the mail goes as an attachment to the address the
 * Firmenverwaltung set (src/jmap/phishing-report.ts), then into Spam like „Als Spam markieren“.
 * Undefined while no address is set: then the menu leaves it out.
 */
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { useToast } from "@/components/ui/toast";
import { sendPhishingReport } from "@/jmap/phishing-report";
import type { EmailDetail } from "@/jmap/types";
import { findRole } from "@/lib/mailboxes";
import { m } from "@/paraglide/messages";
import { usePhishingReport } from "../company/phishing-report";
import { useEmailActions } from "./actions";
import { useSendAccount } from "./use-send-account";

export const useReportPhishing = (
  accountId: string,
  email: EmailDetail,
  mailboxId: string,
): (() => Promise<void>) | undefined => {
  const client = useClient();
  const toast = useToast();
  const actions = useEmailActions(accountId);
  const address = usePhishingReport();
  const { sendAccountId, identities, mailboxes } = useSendAccount(accountId);
  const { data: session } = useSession();
  if (!address) return undefined;

  return async () => {
    const login = session?.username.toLowerCase();
    const identity =
      identities.find((candidate) => candidate.email.toLowerCase() === login) ?? identities[0];
    const drafts = findRole(mailboxes, "drafts");
    if (!identity || !drafts) throw new Error(m.mail_phishing_failed());
    const subject = email.subject ?? "";
    await sendPhishingReport(client, {
      accountId: sendAccountId,
      identity,
      to: address,
      original: { blobId: email.blobId, subject: email.subject, size: email.size },
      draftsId: drafts.id,
      subject: m.mail_phishing_subject({ subject }),
      text: m.mail_phishing_text(),
    });
    await actions.markSpam([email.id], mailboxId, true);
    toast.show(m.mail_phishing_reported({ address }));
  };
};
