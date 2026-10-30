/**
 * A new task, from the "Neue Aufgabe" button, a mail ("Aufgabe", key t), a chat message, a
 * contact or an appointment: title, due day with quick choices, a reminder, who, which board. From a mail it is linked to it
 * and to the sender's contact card, if there is one, and may archive it after. Several mails
 * picked in the list make one task each, with the same day, person and board.
 */
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { findContact } from "@/lib/correspondent";
import { addDays, dateKey } from "@/lib/jscalendar";
import { fullName } from "@/lib/jscontact";
import { contactLink } from "@/lib/task-context";
import { reminderOnDueChange } from "@/lib/task-reminders";
import type { TaskLink } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import { type Contact, useContacts } from "../contacts/queries";
import { useBoards, useMe, usePeople, useTaskActions } from "./queries";
import { TaskReminder } from "./task-reminder";

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
  /** A project of that account, when made on its board. */
  projectId?: string | null;
  link?: TaskLink;
  /** From a mail: the other side's address, linked as a contact when it has a card. */
  person?: string;
};

/** The links of a task: what it was made from, and the person's contact card. */
const linksOf = (start: TaskStart, contacts: Contact[]): TaskLink[] => {
  const card = start.person ? findContact(contacts, start.person) : undefined;
  return [
    ...(start.link ? [start.link] : []),
    ...(card ? [contactLink(card, fullName(card), start.person!)] : []),
  ];
};

const headings = (starts: TaskStart[], contact: Contact | undefined) => {
  const [start] = starts;
  if (starts.length > 1) {
    return {
      title: m.tasks_from_mails_title({ count: starts.length }),
      description: m.tasks_from_mails_link(),
    };
  }
  const kind = start?.link?.kind;
  if (kind === "chat") {
    return { title: m.tasks_from_message_title(), description: m.tasks_from_message_link() };
  }
  if (kind === "contact") {
    return {
      title: m.tasks_from_contact_title({ name: start!.link!.label }),
      description: m.tasks_from_contact_link(),
    };
  }
  if (kind === "event") {
    return {
      title: m.tasks_from_event_title(),
      description: m.tasks_from_event_link({ title: start!.link!.label }),
    };
  }
  if (kind === "mail") {
    return {
      title: m.tasks_from_mail_title(),
      description: contact
        ? m.tasks_from_mail_link_contact({ name: fullName(contact) })
        : m.tasks_from_mail_link(),
    };
  }
  return { title: m.tasks_new(), description: undefined };
};

const SHOWN_TITLES = 4;

export const TaskDialog = ({
  starts,
  onClose,
  onArchive,
}: {
  /** One task, or several made at once (one per picked mail). */
  starts: TaskStart[];
  onClose: () => void;
  /** From mails: archives them after the tasks are made, when the box is ticked. */
  onArchive?: () => Promise<unknown>;
}) => {
  const today = dateKey(new Date());
  const actions = useTaskActions();
  const toast = useToast();
  const people = usePeople();
  const boards = useBoards();
  const me = useMe();
  const { data: contacts } = useContacts();
  const many = starts.length > 1;
  const first = starts[0]!;
  const [title, setTitle] = useState(first.title);
  const [dueDate, setDueDateOnly] = useState<string>("");
  const [remindAt, setRemindAt] = useState<string | null>(null);
  /** A new due day moves a reminder already chosen from it along. */
  const setDueDate = (day: string) => {
    setRemindAt((current) =>
      reminderOnDueChange(
        current,
        { dueDate: dueDate || null, dueTime: null },
        { dueDate: day || null, dueTime: null },
        new Date(),
      ),
    );
    setDueDateOnly(day);
  };
  const [assigneeId, setAssigneeId] = useState(me);
  // Several from one shared mailbox go on its board; from several, on one's own.
  const startBoard = starts.every((start) => start.accountId === first.accountId)
    ? (first.projectId ?? first.accountId)
    : me;
  const [boardId, setBoardId] = useState(
    boards.some((board) => board.id === startBoard) ? startBoard : me,
  );
  const board = boards.find((candidate) => candidate.id === boardId);
  const contact = !many && first.person ? findContact(contacts, first.person) : undefined;
  const { title: heading, description } = headings(starts, contact);
  const [archive, setArchive] = useState(remembered);
  const [busy, setBusy] = useState(false);

  const quick = [
    { label: m.tasks_quick_today(), day: today },
    { label: m.tasks_quick_tomorrow(), day: addDays(today, 1) },
    { label: m.tasks_quick_next_week(), day: nextWeek(today) },
  ];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!many && !title.trim()) return;
    setBusy(true);
    try {
      for (const start of starts) {
        await actions.create({
          accountId: board?.accountId ?? me,
          projectId: board?.projectId ?? null,
          title: many ? start.title || m.mail_no_subject() : title.trim(),
          dueDate: dueDate || null,
          assigneeId: assigneeId || null,
          remindAt,
          links: linksOf(start, contacts),
        });
      }
      if (onArchive) {
        remember(archive);
        if (archive) await onArchive();
      }
      toast.show(many ? m.tasks_created_many({ count: starts.length }) : m.tasks_created());
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
      title={heading}
      description={description}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        {many ? (
          <ul
            aria-label={m.tasks_title_field()}
            className="m-0 flex list-none flex-col gap-1 rounded-[10px] border border-border p-2"
          >
            {starts.slice(0, SHOWN_TITLES).map((start) => (
              <li
                key={start.link?.ref ?? start.title}
                className="flex items-center gap-2 px-1 py-0.5 text-[14px]"
              >
                <span
                  aria-hidden="true"
                  className="size-3.5 shrink-0 rounded-full border border-muted"
                />
                <span className="truncate">{start.title || m.mail_no_subject()}</span>
              </li>
            ))}
            {starts.length > SHOWN_TITLES ? (
              <li className="px-1 text-[13px] text-muted">
                {m.tasks_more({ count: starts.length - SHOWN_TITLES })}
              </li>
            ) : null}
          </ul>
        ) : (
          <Label>
            {m.tasks_title_field()}
            {/* The title first, not the dialog's close button: Radix leaves a focus already inside. */}
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
          </Label>
        )}
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
        <TaskReminder
          key={dueDate}
          task={{ dueDate: dueDate || null, dueTime: null, remindAt }}
          onChange={setRemindAt}
        />
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
            {m.tasks_board()}
            <Select value={boardId} onChange={(e) => setBoardId(e.target.value)}>
              {boards.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
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
            {many ? m.tasks_archive_mails() : m.tasks_archive_mail()}
          </label>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {m.tasks_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={busy || (!many && !title.trim())}>
            {many ? m.tasks_create_many({ count: starts.length }) : m.tasks_create()}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
