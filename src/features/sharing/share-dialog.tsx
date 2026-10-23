/**
 * Who may see or change an address book (later also a calendar): one row per colleague with
 * "Kein Zugriff", "Lesen" or "Bearbeiten". Shared mailboxes are left out; their members already
 * see what belongs to them.
 */
import { type FormEvent, useState } from "react";
import { useSession } from "@/components/shell/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/input";
import { principalName } from "@/jmap/principals";
import { ACCESS, type Access, accessOf, nextShareWith, type ShareWith } from "@/lib/sharing";
import { m } from "@/paraglide/messages";
import { usePrincipals } from "./queries";

const LABELS: Record<Access, () => string> = {
  none: m.sharing_none,
  read: m.sharing_read,
  edit: m.sharing_edit,
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is shared, e.g. the address book's name. */
  title: string;
  shareWith: ShareWith | null | undefined;
  onSave: (next: ShareWith) => Promise<void>;
};

export const ShareDialog = ({ open, onOpenChange, title, shareWith, onSave }: Props) => {
  const { data: session } = useSession();
  const { data: principals = [], isPending } = usePrincipals();
  const [changes, setChanges] = useState<Record<string, Access>>({});
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const people = principals
    .filter((p) => p.type === "individual" && p.email !== session?.username)
    .sort((a, b) => principalName(a).localeCompare(principalName(b), "de"));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setProblem(null);
    try {
      await onSave(nextShareWith(shareWith, changes));
      setChanges({});
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
      description={m.sharing_hint()}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {isPending ? <p className="m-0 text-[14px] text-muted">{m.common_loading()}</p> : null}
        <ul aria-label={m.sharing_people()} className="m-0 flex list-none flex-col gap-1 p-0">
          {people.map((person) => {
            const value = changes[person.id] ?? accessOf(shareWith?.[person.id]);
            return (
              <li key={person.id} className="flex items-center gap-3 py-1">
                <Avatar name={principalName(person)} size={32} />
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
                  className="w-[140px] shrink-0"
                >
                  {ACCESS.map((access) => (
                    <option key={access} value={access}>
                      {LABELS[access]()}
                    </option>
                  ))}
                </Select>
              </li>
            );
          })}
        </ul>
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
