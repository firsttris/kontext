/**
 * "Wiedervorlage" over a mail (or a selection): out of the way until a time – later today,
 * tomorrow, Monday, in a week, or picked by hand. "w" opens the menu.
 */
import { AlarmClock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useShortcuts } from "@/components/use-shortcuts";
import { sendTimeLabel, snoozeChoices } from "@/lib/schedule";
import { m } from "@/paraglide/messages";
import { validUntil } from "../../../server/snooze/snooze";
import { TimeDialog } from "../mail/time-dialog";
import { useSnoozeActions } from "./queries";

/** Puts mails away and offers the way back in the notice. */
export const useSnooze = () => {
  const { snooze } = useSnoozeActions();
  const toast = useToast();
  return async (accountId: string, ids: string[], from: string, until: Date) => {
    try {
      const undo = await snooze(accountId, ids, from, until);
      const when = sendTimeLabel(until);
      toast.show(
        ids.length === 1
          ? m.mail_snoozed_toast({ when })
          : m.mail_snoozed_toast_many({ count: ids.length, when }),
        "info",
        {
          duration: 8000,
          action: {
            label: m.mail_undo(),
            run: () =>
              void undo().catch((error: Error) =>
                toast.show(m.common_error({ message: error.message }), "error"),
              ),
          },
        },
      );
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };
};

export const SnoozeMenu = ({
  accountId,
  ids,
  from,
  onLeave,
  shortcut = false,
}: {
  accountId: string;
  ids: string[];
  from: string;
  /** Before the mails go: e.g. close the open mail. */
  onLeave?: () => unknown;
  /** "w" opens the menu (in the reading pane). */
  shortcut?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const snooze = useSnooze();
  useShortcuts(shortcut ? { w: () => setOpen(true) } : {});
  const pick = async (until: Date) => {
    await onLeave?.();
    await snooze(accountId, ids, from, until);
  };
  return (
    <>
      <MenuRoot open={open} onOpenChange={setOpen}>
        <MenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.mail_snooze()}
            title={shortcut ? `${m.mail_snooze()} (w)` : m.mail_snooze()}
          >
            <AlarmClock size={16} strokeWidth={1.75} />
          </Button>
        </MenuTrigger>
        <MenuContent align="start" aria-label={m.mail_snooze_title()}>
          {snoozeChoices(new Date()).map((choice) => (
            <MenuItem key={choice.label} onSelect={() => void pick(choice.at)}>
              {choice.label}
              <span className="ml-auto pl-4 text-[12px] text-muted">
                {sendTimeLabel(choice.at)}
              </span>
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onSelect={() => setPicking(true)}>{m.mail_later_pick()}</MenuItem>
        </MenuContent>
      </MenuRoot>
      {picking ? (
        <TimeDialog
          title={m.mail_snooze_title()}
          label={m.mail_snooze_when()}
          submit={m.mail_snooze_confirm()}
          invalid={m.mail_snooze_invalid()}
          valid={validUntil}
          onPick={(until) => void pick(until)}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </>
  );
};
