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

/** Mails of one account, taken out of one folder. */
export type SnoozeTarget = { accountId: string; ids: string[]; from: string };

/**
 * Puts mails away and offers the way back in the notice. Several targets (a selection over
 * "Alle Posteingänge") go each into their own account's folder; one notice takes them all back.
 */
export const useSnooze = () => {
  const { snooze } = useSnoozeActions();
  const toast = useToast();
  return async (targets: SnoozeTarget[], until: Date) => {
    const count = targets.reduce((sum, target) => sum + target.ids.length, 0);
    try {
      const results = await Promise.allSettled(
        targets.map((target) => snooze(target.accountId, target.ids, target.from, until)),
      );
      const undos = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      const failed = results.find((result) => result.status === "rejected");
      if (failed) {
        // All or nothing, like the selection bar's choice: what did go away comes back.
        await Promise.allSettled(undos.map((back) => back()));
        throw failed.reason;
      }
      const undo = () => Promise.all(undos.map((back) => back()));
      const when = sendTimeLabel(until);
      toast.show(
        count === 1 ? m.mail_snoozed_toast({ when }) : m.mail_snoozed_toast_many({ count, when }),
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
  targets,
  onLeave,
  shortcut = false,
  small = false,
}: {
  targets: SnoozeTarget[];
  /** Before the mails go: e.g. close the open mail. */
  onLeave?: () => unknown;
  /** "w" opens the menu (in the reading pane). */
  shortcut?: boolean;
  /** The smaller button of the selection bar. */
  small?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const snooze = useSnooze();
  useShortcuts(shortcut ? { w: () => setOpen(true) } : {});
  const pick = async (until: Date) => {
    await onLeave?.();
    await snooze(targets, until);
  };
  return (
    <>
      <MenuRoot open={open} onOpenChange={setOpen}>
        <MenuTrigger asChild>
          <Button
            variant="ghost"
            size={small ? "iconSm" : "icon"}
            disabled={targets.length === 0}
            aria-label={m.mail_snooze()}
            title={shortcut ? `${m.mail_snooze()} (w)` : m.mail_snooze()}
          >
            <AlarmClock size={small ? 15 : 16} strokeWidth={1.75} />
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
