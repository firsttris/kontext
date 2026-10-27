/**
 * Who may see or change an address book or a calendar: one row per colleague with
 * "Kein Zugriff", "Lesen" or "Bearbeiten" (for calendars also "Nur Verfügbarkeit"). Shared
 * mailboxes are left out; their members already see what belongs to them. A calendar also gets a
 * row for all colleagues at once and whether its events count as busy.
 */
import { Users } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/input";
import { ColleagueAvatar } from "@/features/photos/colleague-avatar";
import { principalName } from "@/jmap/principals";
import {
  ACCESS,
  type Access,
  accessOf,
  everyoneAccess,
  nextShareWith,
  type ShareKind,
  type ShareWith,
  withEveryone,
} from "@/lib/sharing";
import { m } from "@/paraglide/messages";
import { useColleagues } from "./queries";

const LABELS: Record<Access, () => string> = {
  none: m.sharing_none,
  availability: m.sharing_availability,
  read: m.sharing_read,
  edit: m.sharing_edit,
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is shared, e.g. the address book's name. */
  title: string;
  kind: ShareKind;
  /** What "Lesen" and "Bearbeiten" mean for this kind. */
  hint: string;
  shareWith: ShareWith | null | undefined;
  /** Calendars: whether their events count as busy for colleagues planning a meeting. */
  includeInAvailability?: boolean;
  onSave: (next: ShareWith, options: { includeInAvailability: boolean }) => Promise<void>;
};

export const ShareDialog = ({
  open,
  onOpenChange,
  title,
  kind,
  hint,
  shareWith,
  includeInAvailability = true,
  onSave,
}: Props) => {
  const { colleagues: people, isPending } = useColleagues();
  const [changes, setChanges] = useState<Record<string, Access>>({});
  const [everyone, setEveryone] = useState<"none" | "availability" | null>(null);
  const [included, setIncluded] = useState(includeInAvailability);
  const isCalendar = kind === "calendar";
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ids = people.map((p) => p.id);
  const base = everyone ? withEveryone(shareWith, ids, everyone) : shareWith;
  const everyoneValue = everyoneAccess(nextShareWith(base, changes, kind), ids);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setProblem(null);
    try {
      await onSave(nextShareWith(base, changes, kind), { includeInAvailability: included });
      setChanges({});
      setEveryone(null);
      onOpenChange(false);
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={m.sharing_title({ name: title })}
      description={hint}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {isPending ? <p className="m-0 text-[14px] text-muted">{m.common_loading()}</p> : null}
        {isCalendar && people.length ? (
          <div className="flex items-center gap-3 rounded-[10px] border border-border bg-side p-3">
            <Users size={20} className="shrink-0 text-muted" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">{m.sharing_everyone()}</span>
              <span className="text-[12px] text-muted">{m.sharing_everyone_hint()}</span>
            </span>
            <Select
              aria-label={m.sharing_everyone()}
              value={everyoneValue}
              onChange={(e) => {
                setEveryone(e.target.value as "none" | "availability");
                setChanges({});
              }}
              className="w-[160px] shrink-0"
            >
              <option value="availability">{m.sharing_availability()}</option>
              <option value="none">{m.sharing_none()}</option>
            </Select>
          </div>
        ) : null}
        <ul aria-label={m.sharing_people()} className="m-0 flex list-none flex-col gap-1 p-0">
          {people.map((person) => {
            const value = changes[person.id] ?? accessOf(base?.[person.id]);
            return (
              <li key={person.id} className="flex items-center gap-3 py-1">
                <ColleagueAvatar id={person.id} name={principalName(person)} size={32} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{principalName(person)}</span>
                  <span className="truncate text-[12px] text-muted">{person.email}</span>
                </span>
                <Select
                  aria-label={principalName(person)}
                  value={value}
                  onChange={(e) =>
                    setChanges((current) => ({
                      ...current,
                      [person.id]: e.target.value as Access,
                    }))
                  }
                  className="w-[160px] shrink-0"
                >
                  {ACCESS[kind].map((access) => (
                    <option key={access} value={access}>
                      {LABELS[access]()}
                    </option>
                  ))}
                </Select>
              </li>
            );
          })}
        </ul>
        {isCalendar ? (
          <label className="flex items-start gap-2.5 border-t border-border pt-3 text-[14px]">
            <input
              type="checkbox"
              checked={included}
              onChange={(e) => setIncluded(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="flex flex-col gap-0.5">
              {m.sharing_include_availability()}
              <span className="text-[12px] text-muted">
                {m.sharing_include_availability_hint()}
              </span>
            </span>
          </label>
        ) : null}
        {problem ? (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {problem}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {m.contacts_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {m.contacts_save()}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
