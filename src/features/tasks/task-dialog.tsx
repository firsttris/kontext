/**
 * A new task, from the "Neue Aufgabe" button or from a mail ("Aufgabe", key t): title, due day
 * with quick choices, who, which board; from a mail it is linked to it and may archive it after.
 */
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { addDays, dateKey } from "@/lib/jscalendar";
import { shortAddress } from "@/lib/mail-accounts";
import type { TaskLink } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import { useBoards, useMe, usePeople, useTaskActions } from "./queries";

const ARCHIVE_KEY = "kontext.tasks.archiveMail";

const remembered = (): boolean => {
  try {
    return localStorage.getItem(ARCHIVE_KEY) === "1";
  } catch {
    return false;
  }
};

const remember = (on: boolean) => {
  try {
    localStorage.setItem(ARCHIVE_KEY, on ? "1" : "0");
  } catch {
    // not kept; the box starts empty next time
  }
};

/** Next Monday. */
const nextWeek = (today: string) => {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addDays(today, (8 - weekday) % 7 || 7);
};

export type TaskStart = {
  title: string;
  accountId: string;
  link?: TaskLink;
};

export const TaskDialog = ({
  start,
  onClose,
  onArchive,
}: {
  start: TaskStart;
  onClose: () => void;
  /** From a mail: archives it after the task is made, when the box is ticked. */
  onArchive?: () => Promise<unknown>;
}) => {
  const today = dateKey(new Date());
  const actions = useTaskActions();
  const toast = useToast();
  const people = usePeople();
  const boards = useBoards();
  const me = useMe();
  const [title, setTitle] = useState(start.title);
  const [dueDate, setDueDate] = useState<string>("");
  const [assigneeId, setAssigneeId] = useState(me);
  const [accountId, setAccountId] = useState(
    boards.some((board) => board.id === start.accountId) ? start.accountId : me,
  );
  const [archive, setArchive] = useState(remembered);
  const [busy, setBusy] = useState(false);

  const quick = [
    { label: m.tasks_quick_today(), day: today },
    { label: m.tasks_quick_tomorrow(), day: addDays(today, 1) },
    { label: m.tasks_quick_next_week(), day: nextWeek(today) },
  ];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await actions.create({
        accountId,
        title: title.trim(),
        dueDate: dueDate || null,
        assigneeId: assigneeId || null,
        links: start.link ? [start.link] : [],
      });
      if (onArchive) {
        remember(archive);
        if (archive) await onArchive();
      }
      toast.show(m.tasks_created());
      onClose();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={
        start.link?.kind === "chat"
          ? m.tasks_from_message_title()
          : start.link
            ? m.tasks_from_mail_title()
            : m.tasks_new()
      }
      description={
        start.link?.kind === "chat"
          ? m.tasks_from_message_link()
          : start.link
            ? m.tasks_from_mail_link()
            : undefined
      }
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <Label>
          {m.tasks_title_field()}
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Label>
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1.5 text-[13px] text-muted">{m.tasks_due()}</legend>
          <div className="flex flex-wrap items-center gap-1.5">
            {quick.map(({ label, day }) => (
              <button
                key={label}
                type="button"
                aria-pressed={dueDate === day}
                onClick={() => setDueDate(dueDate === day ? "" : day)}
                className={cn(
                  "h-8 rounded-full border px-3 text-[13px]",
                  dueDate === day
                    ? "border-primary bg-primary text-onprimary"
                    : "border-border hover:bg-hover",
                )}
              >
                {label}
              </button>
            ))}
            <Input
              type="date"
              aria-label={m.tasks_due()}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-8 w-auto"
            />
          </div>
        </fieldset>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Label>
            {m.tasks_assignee()}
            <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">{m.tasks_nobody()}</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.id === me ? m.tasks_me({ name: person.name }) : person.name}
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            {m.tasks_mailbox()}
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.isPersonal ? m.tasks_my_board() : shortAddress(board.name)}
                </option>
              ))}
            </Select>
          </Label>
        </div>
        {onArchive ? (
          <label className="flex items-center gap-2.5 text-[14px]">
            <input
              type="checkbox"
              checked={archive}
              onChange={(e) => setArchive(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            {m.tasks_archive_mail()}
          </label>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {m.tasks_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
            {m.tasks_create()}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
