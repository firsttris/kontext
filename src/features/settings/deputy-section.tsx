/**
 * "Vertretung": give a colleague the own mailbox, calendars and contacts at once, see who has
 * access to what, and take it all back per person (src/lib/deputy.ts decides the rights).
 */
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ColleagueAvatar } from "@/features/photos/colleague-avatar";
import { useColleagues } from "@/features/sharing/queries";
import { type Principal, principalName } from "@/jmap/principals";
import {
  DEPUTY_KINDS,
  type DeputyEntry,
  type DeputyKind,
  type DeputyLevel,
  deputyOverview,
  grantPatches,
  revokePatches,
} from "@/lib/deputy";
import { m } from "@/paraglide/messages";
import { useApplyDeputy, useDeputyObjects } from "./deputy-queries";
import { SettingsCard } from "./settings-page";

const KIND_LABELS: Record<DeputyKind, () => string> = {
  mailbox: m.deputy_mailbox,
  calendar: m.deputy_calendar,
  addressBook: m.deputy_contacts,
};

const LEVEL_LABELS: Record<DeputyLevel, () => string> = {
  read: m.sharing_read,
  edit: m.sharing_edit,
};

const GrantForm = ({ colleagues }: { colleagues: Principal[] }) => {
  const toast = useToast();
  const apply = useApplyDeputy();
  const [person, setPerson] = useState("");
  const [level, setLevel] = useState<DeputyLevel>("read");
  const [kinds, setKinds] = useState<DeputyKind[]>(DEPUTY_KINDS);
  const id = useId();
  const toggle = (kind: DeputyKind, on: boolean) =>
    setKinds((current) => DEPUTY_KINDS.filter((k) => (k === kind ? on : current.includes(k))));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const deputy = colleagues.find((p) => p.id === person);
    if (!deputy) return;
    try {
      await apply.mutateAsync((objects) => grantPatches(objects, deputy.id, level, kinds));
      toast.show(m.deputy_granted({ name: principalName(deputy) }));
      setPerson("");
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-person`}>{m.deputy_colleague()}</Label>
          <Select
            id={`${id}-person`}
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            required
          >
            <option value="">{m.deputy_choose()}</option>
            {colleagues.map((p) => (
              <option key={p.id} value={p.id}>
                {principalName(p)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-level`}>{m.deputy_level()}</Label>
          <Select
            id={`${id}-level`}
            value={level}
            onChange={(e) => setLevel(e.target.value as DeputyLevel)}
          >
            <option value="read">{m.sharing_read()}</option>
            <option value="edit">{m.sharing_edit()}</option>
          </Select>
        </div>
      </div>
      <fieldset className="m-0 flex flex-wrap gap-x-5 gap-y-2 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[13px] font-medium">{m.deputy_what()}</legend>
        {DEPUTY_KINDS.map((kind) => (
          <label key={kind} className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              checked={kinds.includes(kind)}
              onChange={(e) => toggle(kind, e.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            {KIND_LABELS[kind]()}
          </label>
        ))}
      </fieldset>
      <p className="m-0 text-[12px] text-muted">{m.deputy_levels_hint()}</p>
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          disabled={!person || kinds.length === 0 || apply.isPending}
        >
          {m.deputy_grant()}
        </Button>
      </div>
    </form>
  );
};

/** "Postfach: Lesen · Kalender: Bearbeiten (1 von 2)". */
const accessSummary = (entry: DeputyEntry): string =>
  DEPUTY_KINDS.flatMap((kind) => {
    const access = entry.kinds[kind];
    if (!access) return [];
    const level = LEVEL_LABELS[access.level]();
    const partly =
      access.count < access.total
        ? ` (${m.deputy_partly({ count: access.count, total: access.total })})`
        : "";
    return [m.deputy_kind_access({ kind: KIND_LABELS[kind](), level }) + partly];
  }).join(" · ");

const AccessRow = ({
  entry,
  name,
  colleagues,
}: {
  entry: DeputyEntry;
  name: string;
  colleagues: string[];
}) => {
  const toast = useToast();
  const apply = useApplyDeputy();
  const revoke = async () => {
    try {
      await apply.mutateAsync((objects) => revokePatches(objects, entry.principalId, colleagues));
      toast.show(m.deputy_revoked({ name }));
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };
  return (
    <li className="flex items-center gap-3 py-1.5">
      <ColleagueAvatar id={entry.principalId} name={name} size={32} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{name}</span>
        <span className="text-[12px] text-muted">{accessSummary(entry)}</span>
      </span>
      <Button
        variant="danger"
        size="sm"
        aria-label={m.deputy_revoke_label({ name })}
        disabled={apply.isPending}
        onClick={() => void revoke()}
      >
        {m.deputy_revoke()}
      </Button>
    </li>
  );
};

export const DeputySection = () => {
  const { colleagues } = useColleagues();
  const { data: objects, isPending } = useDeputyObjects();
  const names = new Map(colleagues.map((p) => [p.id, principalName(p)]));
  // Shares with shared mailboxes (groups) or former colleagues are not deputies; they stay.
  const entries = (objects ? deputyOverview(objects) : [])
    .filter((entry) => names.has(entry.principalId))
    .sort((a, b) => names.get(a.principalId)!.localeCompare(names.get(b.principalId)!, "de"));
  const ids = colleagues.map((p) => p.id);

  return (
    <>
      <SettingsCard title={m.deputy_grant_title()} description={m.deputy_grant_hint()}>
        <GrantForm colleagues={colleagues} />
      </SettingsCard>
      <SettingsCard title={m.deputy_list_title()} description={m.deputy_list_hint()}>
        {isPending ? (
          <p className="m-0 text-[14px] text-muted">{m.common_loading()}</p>
        ) : entries.length === 0 ? (
          <p className="m-0 text-[14px] text-muted">{m.deputy_list_empty()}</p>
        ) : (
          <ul aria-label={m.deputy_list_title()} className="m-0 flex list-none flex-col p-0">
            {entries.map((entry) => (
              <AccessRow
                key={entry.principalId}
                entry={entry}
                name={names.get(entry.principalId)!}
                colleagues={ids}
              />
            ))}
          </ul>
        )}
      </SettingsCard>
    </>
  );
};
