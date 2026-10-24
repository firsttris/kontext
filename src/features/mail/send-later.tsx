/**
 * "Später senden": the times that fit the time of day (today at one or five, tomorrow or Monday
 * at eight) or one picked by hand. The server holds the mail until then (FUTURERELEASE).
 */
import { CalendarClock, ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { fromLocal, toLocal } from "@/lib/jscalendar";
import { sendChoices, sendTimeLabel, validSendTime } from "@/lib/schedule";
import { m } from "@/paraglide/messages";

export const SendLater = ({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (at: Date) => void;
}) => {
  const [picking, setPicking] = useState(false);
  const whenId = useId();
  const now = new Date();
  const [value, setValue] = useState(() =>
    toLocal(new Date(now.getTime() + 86_400_000)).slice(0, 16),
  );
  const chosen = value ? fromLocal(`${value}:00`) : null;
  const valid = Boolean(chosen && validSendTime(chosen, new Date()));
  return (
    <>
      <MenuRoot>
        <MenuTrigger asChild>
          <Button
            variant="primary"
            size="iconSm"
            aria-label={m.mail_later()}
            title={m.mail_later()}
            disabled={disabled}
            className="-ml-1.5 rounded-l-none border-l border-onprimary/20"
          >
            <ChevronDown size={15} />
          </Button>
        </MenuTrigger>
        <MenuContent align="start" side="top">
          {sendChoices(now).map((choice) => (
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
        <Dialog open onOpenChange={setPicking} title={m.mail_later()}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              // The dialog sits inside the composer's form in React's tree (a portal only moves
              // the DOM): without this, "Planen" would also send the mail at once.
              event.stopPropagation();
              if (!chosen || !valid) return;
              setPicking(false);
              onPick(chosen);
            }}
          >
            <div className="flex flex-col gap-1.5 text-[12px] text-muted">
              <label htmlFor={whenId}>{m.mail_later_when()}</label>
              <Input
                id={whenId}
                type="datetime-local"
                value={value}
                min={toLocal(now).slice(0, 16)}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
            {chosen && !valid ? (
              <p className="m-0 text-[12px] text-danger">{m.mail_later_invalid()}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPicking(false)}>
                {m.mail_later_cancel()}
              </Button>
              <Button type="submit" variant="primary" disabled={!valid}>
                {m.mail_later_schedule()}
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </>
  );
};
