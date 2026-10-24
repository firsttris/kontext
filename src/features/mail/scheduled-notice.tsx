/** In a mail the server still holds: when it goes out, and "Nicht senden" to get it back. */
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findRole } from "@/lib/mailboxes";
import { sendTimeLabel } from "@/lib/schedule";
import { m } from "@/paraglide/messages";
import { useHeldMails, useMailboxes } from "./queries";
import { useTakeBack } from "./take-back";

export const ScheduledNotice = ({ accountId, emailId }: { accountId: string; emailId: string }) => {
  const held = useHeldMails(accountId).find((mail) => mail.emailId === emailId);
  const { data: mailboxes = [] } = useMailboxes(accountId);
  const drafts = findRole(mailboxes, "drafts");
  const takeBack = useTakeBack();
  if (!held || !drafts) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/5 px-3 py-2 text-[14px]">
      <CalendarClock size={16} className="shrink-0 text-warn" aria-hidden="true" />
      <span className="flex-1">
        {m.mail_scheduled_notice({ when: sendTimeLabel(new Date(held.sendAt)) })}
      </span>
      <Button size="sm" onClick={() => void takeBack(accountId, held, drafts.id)}>
        {m.mail_unsend()}
      </Button>
    </div>
  );
};
