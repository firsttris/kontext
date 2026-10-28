/**
 * A task due on a day, among the appointments: a ring to tick it off (with "Rückgängig"), its
 * title opening it in the tasks app; overdue ones on today, in red. Shown unless switched off
 * under "Meine Kalender" ("tasks" in the hidden calendars).
 */
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { DayTask } from "@/lib/task-context";
import { m } from "@/paraglide/messages";
import { useTaskActions } from "../tasks/queries";
import { setCalendarHidden, useHiddenCalendars } from "./hidden-calendars";

const TASKS_KEY = "tasks";

export const useTasksShown = (): boolean => !useHiddenCalendars().has(TASKS_KEY);

/** The box to show or hide tasks, below the calendars. */
export const TasksToggle = () => {
  const shown = useTasksShown();
  return (
    <label className="flex min-h-8 cursor-pointer items-center gap-2.5">
      <input
        type="checkbox"
        checked={shown}
        onChange={(e) => setCalendarHidden(TASKS_KEY, !e.target.checked)}
        className="size-4 shrink-0 accent-[var(--primary)]"
      />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate">{m.calendar_tasks()}</span>
        <span className="truncate text-[12px] text-muted">{m.calendar_tasks_hint()}</span>
      </span>
    </label>
  );
};

export const TaskChip = ({
  entry,
  size = "sm",
}: {
  entry: DayTask;
  /** "sm" in the grids, "md" in the list. */
  size?: "sm" | "md";
}) => {
  const { task, overdue } = entry;
  const actions = useTaskActions();
  const toast = useToast();
  const complete = async () => {
    try {
      await actions.update(task.id, { status: "done" });
      toast.show(m.calendar_task_done({ title: task.title }), "info", {
        action: {
          label: m.mail_undo(),
          run: () => void actions.update(task.id, { status: task.status }),
        },
      });
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };
  return (
    <span
      className={cn(
        "group flex min-w-0 items-center gap-1.5 rounded-md text-fg",
        // On a phone the row is a touch target of 24 px at least (WCAG 2.5.8).
        size === "sm"
          ? "px-1 py-px text-[12px] max-md:min-h-[26px]"
          : "-ml-[5px] flex-1 text-[14px] font-medium",
      )}
    >
      {/* The ring is small in the grids; the button around it is larger to hit, so a click
          just beside it ticks off rather than opens the task. */}
      <button
        type="button"
        onClick={() => void complete()}
        aria-label={m.tasks_toggle_done({ title: task.title })}
        title={m.tasks_complete()}
        className={cn(
          "group/done flex shrink-0 items-center justify-center",
          size === "sm"
            ? "-mx-1.5 -my-1 px-1.5 py-1 max-md:my-0 max-md:self-stretch max-md:py-0"
            : "-m-2 p-2",
        )}
      >
        <span
          className={cn(
            "flex items-center justify-center rounded-full border-[1.5px] text-transparent group-hover/done:border-ok group-hover/done:bg-ok/10 group-hover/done:text-ok",
            size === "sm" ? "size-3.5" : "size-[18px]",
            overdue ? "border-danger" : "border-muted",
          )}
        >
          <Check size={size === "sm" ? 9 : 12} strokeWidth={3} />
        </span>
      </button>
      <Link
        to="/tasks"
        search={{ task: task.id }}
        className="flex min-w-0 flex-1 items-baseline gap-1 text-inherit no-underline hover:underline max-md:self-stretch max-md:items-center"
      >
        {task.dueTime && !overdue && size === "sm" ? (
          <span className="shrink-0 font-mono text-[11px] text-muted">{task.dueTime}</span>
        ) : null}
        <span className={cn("truncate", overdue && size === "sm" && "text-danger")}>
          {task.title}
        </span>
        {/* In the narrow grids red says it; the word is for screen readers there. */}
        {overdue ? (
          <span
            className={cn(
              "shrink-0 text-[11px] font-medium text-danger",
              size === "sm" && "sr-only",
            )}
          >
            {m.calendar_task_overdue()}
          </span>
        ) : null}
      </Link>
    </span>
  );
};
