/**
 * The tasks app: views and boards | the list (or a board) | the open task. On a phone one screen
 * at a time, chosen by the URL; views and boards are chips above the list.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { List, SquareKanban } from "lucide-react";
import { useState } from "react";
import { TabBar } from "@/components/shell/app-shell";
import { cn } from "@/lib/cn";
import { dateKey } from "@/lib/jscalendar";
import { shortAddress } from "@/lib/mail-accounts";
import { inView, type TaskView } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import type { TasksSearch } from "@/routes/_app/tasks";
import { useBoards, useMe, useTasks } from "./queries";
import { TaskBoard } from "./task-board";
import { TaskDetail } from "./task-detail";
import { TaskDialog } from "./task-dialog";
import { TaskList } from "./task-list";
import { TaskSidebar, VIEWS } from "./task-sidebar";

const chip = (active: boolean) =>
  cn(
    "flex h-8 shrink-0 items-center rounded-full px-3.5 text-[14px] no-underline",
    active ? "bg-primary text-onprimary" : "border border-border text-muted",
  );

const ModeSwitch = ({ board, mode }: { board: string; mode: "list" | "board" }) => (
  <div className="flex gap-0.5 rounded-[9px] bg-subtle p-[3px]">
    {(
      [
        ["list", m.tasks_list(), List],
        ["board", m.tasks_board(), SquareKanban],
      ] as const
    ).map(([value, label, Icon]) => (
      <Link
        key={value}
        to="/tasks"
        search={{ board, mode: value }}
        aria-pressed={mode === value}
        aria-label={label}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[13px] no-underline",
          mode === value ? "bg-bg text-fg shadow-sm" : "text-muted hover:text-fg",
        )}
      >
        <Icon size={14} strokeWidth={1.75} />
        <span className="hidden sm:inline">{label}</span>
      </Link>
    ))}
  </div>
);

export const TasksPage = ({ search }: { search: TasksSearch }) => {
  const navigate = useNavigate();
  const me = useMe();
  const { tasks } = useTasks();
  const allBoards = useBoards();
  const today = dateKey(new Date());
  const [creating, setCreating] = useState(false);

  const board = search.board
    ? allBoards.find((candidate) => candidate.id === search.board)
    : undefined;
  const mode = board ? (search.mode ?? "board") : "list";
  const view: TaskView = search.show ?? "mine";
  const open = tasks.find((task) => task.id === search.task);
  const shown = board
    ? tasks.filter((task) => task.accountId === board.id)
    : tasks.filter((task) => inView(task, view, me, today));
  const title = board
    ? board.isPersonal
      ? m.tasks_my_board()
      : m.tasks_board_of({ mailbox: shortAddress(board.name) })
    : VIEWS.find((entry) => entry.view === view)!.label();
  const counts = Object.fromEntries(
    VIEWS.map(({ view: key }) => [
      key,
      tasks.filter((task) => inView(task, key, me, today)).length,
    ]),
  ) as Record<TaskView, number>;
  const boards = allBoards.map((entry) => ({
    ...entry,
    open: tasks.filter((task) => task.accountId === entry.id && task.status !== "done").length,
  }));
  // A quick entry in "Heute" is due today, otherwise it would not show where it was typed.
  const addTo = board
    ? { accountId: board.id, assigneeId: null }
    : view === "done"
      ? null
      : { accountId: me, assigneeId: null, ...(view === "today" ? { dueDate: today } : {}) };

  const phoneChips = (
    <nav aria-label={m.tasks_title()} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:hidden">
      {VIEWS.map(({ view: key, label }) => (
        <Link key={key} to="/tasks" search={{ show: key }} className={chip(!board && view === key)}>
          {label()}
        </Link>
      ))}
      {boards.map((entry) => (
        <Link
          key={entry.id}
          to="/tasks"
          search={{ board: entry.id }}
          className={chip(board?.id === entry.id)}
        >
          {entry.isPersonal ? m.tasks_my_board() : shortAddress(entry.name)}
        </Link>
      ))}
    </nav>
  );

  const closeTask = () =>
    void navigate({
      from: "/tasks",
      to: "/tasks",
      search: (prev) => ({ ...prev, task: undefined }),
    });

  return (
    <>
      <div className="hidden h-full w-[236px] shrink-0 flex-col border-r border-border bg-side lg:flex">
        <TaskSidebar
          search={search}
          counts={counts}
          boards={boards}
          onNew={() => setCreating(true)}
        />
      </div>
      {mode === "board" && board ? (
        <>
          <section
            aria-label={title}
            className={cn("h-full min-w-0 flex-1 flex-col", open ? "hidden xl:flex" : "flex")}
          >
            <header className="flex flex-col gap-3 border-b border-border px-4 pt-3 pb-3 md:px-6 md:pt-4">
              <div className="flex items-center gap-3">
                <h1 className="m-0 flex-1 truncate text-[30px] leading-tight font-semibold tracking-tight md:text-[18px]">
                  {title}
                </h1>
                <ModeSwitch board={board.id} mode="board" />
              </div>
              {phoneChips}
            </header>
            <TaskBoard accountId={board.id} tasks={shown} openId={open?.id} />
            <TabBar />
          </section>
          {open ? (
            <aside className="flex h-full w-full flex-col border-l border-border xl:w-[460px] xl:shrink-0">
              <TaskDetail key={open.id} task={open} onClose={closeTask} />
            </aside>
          ) : null}
        </>
      ) : (
        <>
          <div
            className={cn(
              "h-full w-full shrink-0 flex-col border-border md:w-[380px] md:border-r xl:w-[460px]",
              open ? "hidden md:flex" : "flex",
            )}
          >
            <div className="min-h-0 flex-1">
              <TaskList
                title={title}
                tasks={shown}
                openId={open?.id}
                addTo={addTo}
                showBoards={!board}
                header={board ? <ModeSwitch board={board.id} mode="list" /> : null}
                below={phoneChips}
              />
            </div>
            <TabBar />
          </div>
          <main className={cn("h-full min-w-0 flex-1 flex-col", open ? "flex" : "hidden md:flex")}>
            {open ? (
              <TaskDetail key={open.id} task={open} />
            ) : (
              <div className="flex flex-1 items-center justify-center text-[14px] text-muted">
                {m.tasks_pick()}
              </div>
            )}
          </main>
        </>
      )}
      {creating ? (
        <TaskDialog
          start={{ title: "", accountId: board?.id ?? me }}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </>
  );
};
