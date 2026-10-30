/** One task in a list: its box to tick off, title, due date, what it is about, who does it. */
import { Link } from "@tanstack/react-router";
import { BellRing, Mail, Repeat } from "lucide-react";
import { ColleagueAvatar } from "@/features/photos/colleague-avatar";
import { cn } from "@/lib/cn";
import { dueGroup, dueLabel, type Task } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import { DeleteTaskButton } from "./delete-task";

export const dueTone = (task: Task, today: string): string => {
  if (task.status === "done" || !task.dueDate) return "text-muted";
  const group = dueGroup(task.dueDate, today);
  return group === "overdue" ? "text-danger" : group === "today" ? "text-warn" : "text-muted";
};

export const TaskRow = ({
  task,
  today,
  active,
  board,
  assignee,
  onToggle,
  onDelete,
  inTasks = true,
}: {
  task: Task;
  today: string;
  active: boolean;
  /** The shared mailbox's name, when the list mixes boards. */
  board: string | null;
  assignee: string | null;
  onToggle: () => void;
  /** Where the task may be deleted: a bin when the row is pointed at (the phone has it in the task). */
  onDelete?: () => void;
  /** Within the tasks app the view stays as it is; elsewhere (a contact) it opens the task. */
  inTasks?: boolean;
}) => {
  const done = task.status === "done";
  const mail = task.links.find((link) => link.kind === "mail");
  const checked = task.checklist.filter((item) => item.done).length;
  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 rounded-[10px] px-3 py-2.5 hover:bg-hover",
        active && "bg-subtle",
      )}
    >
      {/* More to hit than the box shows: a click just beside it ticks off, not opens. */}
      <label className="-m-2.5 mt-[-8px] flex shrink-0 cursor-pointer p-2.5">
        <input
          type="checkbox"
          checked={done}
          onChange={onToggle}
          aria-label={m.tasks_toggle_done({ title: task.title })}
          className="size-[18px] cursor-pointer rounded-full accent-[var(--primary)]"
        />
      </label>
      <Link
        to="/tasks"
        search={inTasks ? (prev) => ({ ...prev, task: task.id }) : { task: task.id }}
        className="flex min-w-0 flex-1 flex-col gap-1 text-fg no-underline"
      >
        <span className={cn("truncate font-medium", done && "text-muted line-through")}>
          {task.title}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-[12px] text-muted">
          {task.dueDate ? (
            <span className={cn("shrink-0 font-medium", dueTone(task, today))}>
              {dueLabel(task.dueDate, task.dueTime, today)}
            </span>
          ) : null}
          {task.repeat && !done ? (
            <Repeat size={12} className="shrink-0" aria-label={m.tasks_repeat()} />
          ) : null}
          {task.remindAt && !done ? (
            <BellRing size={12} className="shrink-0" aria-label={m.tasks_remind()} />
          ) : null}
          {mail ? (
            <span className="flex min-w-0 items-center gap-1 truncate">
              <Mail size={12} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{mail.detail || mail.label}</span>
            </span>
          ) : null}
          {board ? (
            <span className="min-w-0 truncate rounded-md bg-subtle px-1.5 text-[11px] font-medium">
              {board}
            </span>
          ) : null}
          {task.checklist.length ? (
            <span className="shrink-0 font-mono">
              {checked}/{task.checklist.length}
            </span>
          ) : null}
        </span>
      </Link>
      {assignee ? <ColleagueAvatar id={task.assigneeId} name={assignee} size={24} /> : null}
      {onDelete ? (
        <DeleteTaskButton
          label={m.tasks_delete_named({ title: task.title })}
          onDelete={onDelete}
          className="absolute top-2 right-2 hidden bg-bg md:flex md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        />
      ) : null}
    </div>
  );
};
