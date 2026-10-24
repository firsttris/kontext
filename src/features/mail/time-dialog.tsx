/** A time picked by hand, for "Später senden" and "Wiedervorlage". */
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fromLocal, toLocal } from "@/lib/jscalendar";
import { m } from "@/paraglide/messages";

export const TimeDialog = ({
  title,
  label,
  submit,
  invalid,
  valid,
  onPick,
  onClose,
}: {
  title: string;
  label: string;
  submit: string;
  /** Shown while the time does not do. */
  invalid: string;
  valid: (at: Date, now: Date) => boolean;
  onPick: (at: Date) => void;
  onClose: () => void;
}) => {
  const whenId = useId();
  const now = new Date();
  // Tomorrow at this time to start with.
  const [value, setValue] = useState(() =>
    toLocal(new Date(now.getTime() + 86_400_000)).slice(0, 16),
  );
  const chosen = value ? fromLocal(`${value}:00`) : null;
  const ok = Boolean(chosen && valid(chosen, new Date()));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={title}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          // The dialog may sit inside another form in React's tree (a portal only moves the
          // DOM): in the composer, "Planen" would otherwise also send the mail at once.
          event.stopPropagation();
          if (!chosen || !ok) return;
          onClose();
          onPick(chosen);
        }}
      >
        <div className="flex flex-col gap-1.5 text-[12px] text-muted">
          <label htmlFor={whenId}>{label}</label>
          <Input
            id={whenId}
            type="datetime-local"
            value={value}
            min={toLocal(now).slice(0, 16)}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        {chosen && !ok ? <p className="m-0 text-[12px] text-danger">{invalid}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {m.mail_later_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={!ok}>
            {submit}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
