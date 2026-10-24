/** In a mail on Wiedervorlage: when it comes back, and "Jetzt zurückholen". */
import { AlarmClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { sendTimeLabel } from "@/lib/schedule";
import { m } from "@/paraglide/messages";
import { useSnoozeActions, useSnoozes } from "./queries";

export const SnoozeNotice = ({
  accountId,
  emailId,
  canChange,
}: {
  accountId: string;
  emailId: string;
  /** Who only reads the mailbox sees the time, but cannot fetch the mail back. */
  canChange: boolean;
}) => {
  const until = useSnoozes(accountId).get(emailId);
  const { bringBack } = useSnoozeActions();
  const toast = useToast();
  if (!until) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-[14px]">
      <AlarmClock size={16} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="flex-1">
        {m.mail_snooze_notice({ when: sendTimeLabel(new Date(until)) })}
      </span>
      {canChange ? (
        <Button
          size="sm"
          onClick={() =>
            void bringBack(accountId, [emailId]).then(
              () => toast.show(m.mail_snooze_back()),
              (error: Error) => toast.show(m.common_error({ message: error.message }), "error"),
            )
          }
        >
          {m.mail_snooze_now()}
        </Button>
      ) : null}
    </div>
  );
};
