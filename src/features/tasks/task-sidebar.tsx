/**
 * The tasks' sidebar: the own views with their counts, the boards – each mailbox's own with its
 * projects under it – and "Neue Aufgabe".
 */
import { Link } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, Plus, SquareKanban, Sun, User, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { TaskView } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import type { TasksSearch } from "@/routes/_app/tasks";
import type { Board } from "./queries";

export const VIEWS: { view: TaskView; label: () => string; icon: typeof User }[] = [
  { view: "mine", label: m.tasks_view_mine, icon: User },
  { view: "today", label: m.tasks_view_today, icon: Sun },
  { view: "upcoming", label: m.tasks_view_upcoming, icon: CalendarDays },
  { view: "done", label: m.tasks_view_done, icon: CheckCircle2 },
];

const item = (active: boolean) =>
  cn(
    "flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[14px] no-underline hover:bg-hover",
    active ? "bg-subtle font-medium text-fg" : "text-muted",
  );

const Count = ({ value }: { value: number }) =>
  value > 0 ? <span className="ml-auto font-mono text-[12px] text-muted">{value}</span> : null;

export const TaskSidebar = ({
  search,
  counts,
  boards,
  onNew,
  onNewBoard,
  footer,
}: {
  search: TasksSearch;
  counts: Record<TaskView, number>;
  boards: (Board & { open: number })[];
  onNew: () => void;
  onNewBoard: () => void;
  footer?: ReactNode;
}) => (
  <div className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-4">
    <Button variant="primary" className="h-[38px]" onClick={onNew}>
      <Plus size={15} /> {m.tasks_new()}
    </Button>
    <nav aria-label={m.tasks_title()} className="flex flex-col gap-px">
      {VIEWS.map(({ view, label, icon: Icon }) => {
        const active = !search.board && (search.show ?? "mine") === view;
        return (
          <Link
            key={view}
            to="/tasks"
            search={{ show: view }}
            aria-current={active ? "page" : undefined}
            className={item(active)}
          >
            <Icon size={16} strokeWidth={1.75} />
            <span>{label()}</span>
            {view === "done" ? null : <Count value={counts[view]} />}
          </Link>
        );
      })}
    </nav>
    <nav aria-label={m.tasks_boards()} className="flex flex-col gap-px">
      <div className="flex items-center justify-between pb-1.5 pl-2.5">
        <span className="text-[12px] font-medium text-muted">{m.tasks_boards()}</span>
        <button
          type="button"
          onClick={onNewBoard}
          aria-label={m.tasks_board_new()}
          title={m.tasks_board_new()}
          className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
        >
          <Plus size={14} />
        </button>
      </div>
      {boards.map((board) => {
        const active = search.board === board.id;
        return (
          <Link
            key={board.id}
            to="/tasks"
            search={{ board: board.id }}
            aria-current={active ? "page" : undefined}
            className={cn(item(active), board.projectId && "pl-7")}
          >
            {board.projectId ? (
              <SquareKanban size={15} strokeWidth={1.75} />
            ) : board.isPersonal ? (
              <span aria-hidden="true" className="mx-[3px] size-2.5 rounded-full bg-accent" />
            ) : (
              <Users size={15} strokeWidth={1.75} />
            )}
            <span className="truncate">{board.name}</span>
            <Count value={board.open} />
          </Link>
        );
      })}
    </nav>
    <div className="flex-1" />
    {footer}
  </div>
);
