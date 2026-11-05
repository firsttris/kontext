/**
 * Renames a calendar or an address book, and gives a calendar its colour: a name field and, when
 * `colors` are given, one swatch per colour. Saving is the caller's; a failure stays in the dialog.
 */
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";

export type ColorChoice = { color: string; name: () => string };

type Props = {
  title: string;
  nameLabel: string;
  name: string;
  color?: string;
  colors?: ColorChoice[];
  onSave: (name: string, color: string | undefined) => Promise<void>;
  onClose: () => void;
};

export const NameDialog = ({ title, nameLabel, colors, onSave, onClose, ...start }: Props) => {
  const [name, setName] = useState(start.name);
  const [color, setColor] = useState(start.color);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave(name.trim(), color);
      onClose();
    } catch (error) {
      setProblem(m.common_error({ message: (error as Error).message }));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={title}>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <Label>
          {nameLabel}
          <Input value={name} maxLength={255} onChange={(e) => setName(e.target.value)} />
        </Label>
        {colors ? (
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1.5 p-0 text-[13px] text-muted">{m.calendar_color()}</legend>
            <div className="flex flex-wrap gap-1">
              {colors.map((choice) => (
                <button
                  key={choice.color}
                  type="button"
                  aria-label={choice.name()}
                  aria-pressed={choice.color === color}
                  onClick={() => setColor(choice.color)}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg hover:bg-hover",
                    choice.color === color && "ring-2 ring-border",
                  )}
                >
                  <span className="size-5 rounded-full" style={{ background: choice.color }} />
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}
        {problem ? (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {problem}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {m.calendar_event_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            {m.calendar_event_save()}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
