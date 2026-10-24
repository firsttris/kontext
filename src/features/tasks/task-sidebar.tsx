/** The tasks' sidebar: the own views with their counts, the boards, and "Neue Aufgabe". */
import { Link } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, Plus, Sun, User, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { shortAddress } from "@/lib/mail-accounts";
import type { TaskView } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import type { TasksSearch } from "@/routes/_app/tasks";

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
  footer,
}: {
  search: TasksSearch;
  counts: Record<TaskView, number>;
  boards: { id: string; name: string; isPersonal: boolean; open: number }[];
  onNew: () => void;
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
      <div className="px-2.5 pb-1.5 text-[12px] font-medium text-muted">{m.tasks_boards()}</div>
      {boards.map((board) => {
        const active = search.board === board.id;
        return (
          <Link
            key={board.id}
            to="/tasks"
            search={{ board: board.id }}
            aria-current={active ? "page" : undefined}
            className={item(active)}
          >
            {board.isPersonal ? (
              <span aria-hidden="true" className="mx-[3px] size-2.5 rounded-full bg-accent" />
            ) : (
              <Users size={15} strokeWidth={1.75} />
            )}
            <span className="truncate">
              {board.isPersonal ? m.tasks_my_board() : shortAddress(board.name)}
            </span>
            <Count value={board.open} />
          </Link>
        );
      })}
    </nav>
    <div className="flex-1" />
    {footer}
  </div>
);
