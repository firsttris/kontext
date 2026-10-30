/**
 * Mails in a shared mailbox given to a person and marked done: the toolbar menu, the chip in the
 * list and over the mail, and the names behind the principal ids (src/lib/assignment.ts).
 */
import { CircleCheck, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MenuCheckboxItem,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { principalName } from "@/jmap/principals";
import type { EmailSummary } from "@/jmap/types";
import { type Assignment, assignmentOf } from "@/lib/assignment";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { usePersonalAccountId } from "../settings/queries";
import { usePrincipals } from "../sharing/queries";
import { useEmailActions } from "./actions";

/** The people of the company by principal id, the own one first. */
export const usePeople = () => {
  const me = usePersonalAccountId();
  const { data = [] } = usePrincipals();
  const people = data
    .filter((principal) => principal.type === "individual")
    .map((principal) => ({ id: principal.id, name: principalName(principal) }))
    .sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : a.name.localeCompare(b.name, "de")));
  const nameOf = (id: string) => people.find((person) => person.id === id)?.name ?? "";
  return { me, people, nameOf };
};

// Radix gives the choice back as a string; no principal id is "-".
const NOBODY = "-";

export const AssignMenu = ({ accountId, email }: { accountId: string; email: EmailSummary }) => {
  const actions = useEmailActions(accountId);
  const toast = useToast();
  const { me, people } = usePeople();
  const current = assignmentOf(email);

  const save = async (next: Assignment) => {
    try {
      await actions.assign(email.id, next);
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <MenuRoot>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={m.mail_assign()} title={m.mail_assign()}>
          <UserCheck size={16} strokeWidth={1.75} />
        </Button>
      </MenuTrigger>
      <MenuContent align="start">
        <MenuLabel>{m.mail_assign()}</MenuLabel>
        <MenuRadioGroup
          value={current.assignee ?? NOBODY}
          onValueChange={(id) => void save({ ...current, assignee: id === NOBODY ? null : id })}
        >
          {people.map((person) => (
            <MenuRadioItem key={person.id} value={person.id}>
              {person.id === me ? m.mail_assign_me() : person.name}
            </MenuRadioItem>
          ))}
          <MenuRadioItem value={NOBODY}>{m.mail_assign_nobody()}</MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuCheckboxItem
          checked={current.done}
          onCheckedChange={(done) => void save({ ...current, done })}
        >
          {m.mail_assign_done()}
        </MenuCheckboxItem>
      </MenuContent>
    </MenuRoot>
  );
};

/** "Zugewiesen an Anna" or "Erledigt · Anna", in the list (`compact`) and over the open mail. */
export const AssignmentChip = ({
  email,
  compact = false,
}: {
  email: Pick<EmailSummary, "metadata">;
  compact?: boolean;
}) => {
  const { nameOf } = usePeople();
  const { assignee, done } = assignmentOf(email);
  if (!assignee && !done) return null;
  const name = assignee ? nameOf(assignee) : "";
  const shown = (compact ? name.split(" ")[0] : name) ?? "";
  const label = done
    ? shown
      ? m.mail_assigned_done_by({ name: shown })
      : m.mail_assigned_done()
    : m.mail_assigned_to({ name: shown });
  const Icon = done ? CircleCheck : UserCheck;
  return (
    <span
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full font-medium",
        compact ? "h-[18px] px-1.5 text-[11px]" : "self-start px-2 py-0.5 text-[12px]",
        done ? "bg-subtle text-muted" : "bg-accent/10 text-accent-ink",
      )}
    >
      <Icon size={compact ? 11 : 13} strokeWidth={2.25} aria-hidden="true" />
      {compact && !done ? shown : label}
    </span>
  );
};
