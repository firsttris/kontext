/** One task in a list: its box to tick off, title, due date, what it is about, who does it. */
import { Link } from "@tanstack/react-router";
import { BellRing, Mail, Repeat } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { shortAddress } from "@/lib/mail-accounts";
import { dueGroup, dueLabel, type Task } from "@/lib/tasks";
import { m } from "@/paraglide/messages";

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
  inTasks = true,
}: {
  task: Task;
  today: string;
  active: boolean;
  /** The shared mailbox's name, when the list mixes boards. */
  board: string | null;
  assignee: string | null;
  onToggle: () => void;
  /** Within the tasks app the view stays as it is; elsewhere (a contact) it opens the task. */
  inTasks?: boolean;
}) => {
  const done = task.status === "done";
  const mail = task.links.find((link) => link.kind === "mail");
  const checked = task.checklist.filter((item) => item.done).length;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-[10px] px-3 py-2.5 hover:bg-hover",
        active && "bg-subtle",
      )}
    >
      <input
        type="checkbox"
        checked={done}
        onChange={onToggle}
        aria-label={m.tasks_toggle_done({ title: task.title })}
        className="mt-0.5 size-[18px] shrink-0 cursor-pointer rounded-full accent-[var(--primary)]"
      />
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
            <span className="shrink-0 rounded-md bg-subtle px-1.5 text-[11px] font-medium">
              {shortAddress(board)}
            </span>
          ) : null}
          {task.checklist.length ? (
            <span className="shrink-0 font-mono">
              {checked}/{task.checklist.length}
            </span>
          ) : null}
        </span>
      </Link>
      {assignee ? <Avatar name={assignee} size={24} /> : null}
    </div>
  );
};
