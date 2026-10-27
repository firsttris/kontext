/**
 * "Später senden": the times that fit the time of day (today at one or five, tomorrow or Monday
 * at eight) or one picked by hand. The server holds the mail until then (FUTURERELEASE).
 */
import { CalendarClock, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { sendChoices, sendTimeLabel, validSendTime } from "@/lib/schedule";
import { m } from "@/paraglide/messages";
import { TimeDialog } from "./time-dialog";

export const SendLater = ({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (at: Date) => void;
}) => {
  const [picking, setPicking] = useState(false);
  return (
    <>
      <MenuRoot>
        <MenuTrigger asChild>
          <Button
            variant="primary"
            size="icon"
            aria-label={m.mail_later()}
            title={m.mail_later()}
            disabled={disabled}
            className="w-8 rounded-l-none border-l border-onprimary/20"
          >
            <ChevronDown size={15} />
          </Button>
        </MenuTrigger>
        <MenuContent align="start" side="top">
          {sendChoices(new Date()).map((choice) => (
            <MenuItem key={choice.label} onSelect={() => onPick(choice.at)}>
              <CalendarClock size={15} /> {choice.label}
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
          title={m.mail_later()}
          label={m.mail_later_when()}
          submit={m.mail_later_schedule()}
          invalid={m.mail_later_invalid()}
          valid={validSendTime}
          onPick={onPick}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </>
  );
};
