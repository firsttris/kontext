/**
 * A list of tasks grouped by due date (overdue, today, this week, later, without date, done),
 * with the quick entry on top: "Rückruf Hoffmann morgen" makes a task due tomorrow.
 */
import { Plus } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { dateKey } from "@/lib/jscalendar";
import { boardKey, groupByDue, parseQuickAdd, type Task } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import { useDeleteTask } from "./delete-task";
import { setHideDone } from "./hide-done";
import { useBoards, useOnMyBoards, usePeople, useTaskActions } from "./queries";
import { TaskRow } from "./task-row";

export const TaskList = ({
  title,
  tasks,
  openId,
  addTo,
  showBoards,
  hiddenDone = 0,
  header,
  below,
}: {
  title: string;
  tasks: Task[];
  openId: string | undefined;
  /** Where a quick entry goes: the board, to whom, and the day when none is typed. */
  addTo: {
    accountId: string;
    projectId?: string | null;
    assigneeId: string | null;
    dueDate?: string;
  } | null;
  showBoards: boolean;
  /** How many done tasks "Erledigte ausblenden" keeps out of the list. */
  hiddenDone?: number;
  /** Next to the title, e.g. the list/board switch. */
  header?: ReactNode;
  /** Under the title, e.g. the phone's views and boards. */
  below?: ReactNode;
}) => {
  const today = dateKey(new Date());
  const actions = useTaskActions();
  const toast = useToast();
  const people = usePeople();
  const boards = useBoards();
  const onMyBoards = useOnMyBoards();
  const deleteTask = useDeleteTask();
  const [entry, setEntry] = useState("");
  const nameOf = (id: string | null) => people.find((person) => person.id === id)?.name ?? null;
  // Named unless on one's own board: a shared mailbox's, or a project.
  const boardOf = (task: Task) => {
    if (!showBoards) return null;
    const board = boards.find((candidate) => candidate.id === boardKey(task));
    return board && (board.projectId || !board.isPersonal) ? board.name : null;
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!addTo || !entry.trim()) return;
    const { title: name, dueDate } = parseQuickAdd(entry, today);
    setEntry("");
    try {
      await actions.create({ ...addTo, title: name, dueDate: dueDate ?? addTo.dueDate ?? null });
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  const groups = groupByDue(tasks, today);
  return (
    <section aria-label={title} className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-3 px-4 pt-3 pb-3 md:pt-4">
        <div className="flex items-center gap-3">
          <h1 className="m-0 flex-1 truncate text-[30px] leading-tight font-semibold tracking-tight md:text-[18px]">
            {title}
          </h1>
          {header}
        </div>
        {below}
        {addTo ? (
          <form onSubmit={(event) => void add(event)}>
            <label className="flex h-10 items-center gap-2.5 rounded-[10px] border border-border px-3 text-muted focus-within:border-muted">
              <Plus size={16} aria-hidden="true" />
              <input
                aria-label={m.tasks_new()}
                placeholder={m.tasks_quick_add()}
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-fg outline-none"
              />
            </label>
          </form>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {groups.length === 0 ? (
          <p className="px-3 py-6 text-[14px] text-muted">{m.tasks_empty()}</p>
        ) : (
          groups.map((group) => (
            <div key={group.group} className="mb-3 flex flex-col gap-px">
              <h2
                className={`m-0 px-3 py-1 text-[12px] font-semibold ${group.group === "overdue" ? "text-danger" : "text-fg"}`}
              >
                {group.label}
              </h2>
              <ul aria-label={group.label} className="m-0 flex list-none flex-col gap-px p-0">
                {group.tasks.map((task) => (
                  <li key={task.id}>
                    <TaskRow
                      task={task}
                      today={today}
                      active={task.id === openId}
                      board={boardOf(task)}
                      assignee={nameOf(task.assigneeId)}
                      onToggle={() =>
                        void actions.update(task.id, {
                          status: task.status === "done" ? "open" : "done",
                        })
                      }
                      onDelete={onMyBoards(task) ? () => void deleteTask(task.id) : undefined}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        {hiddenDone > 0 ? <ShowDone count={hiddenDone} /> : null}
      </div>
    </section>
  );
};

/** Under a list or in the board's last column, while done tasks are hidden: they come back. */
export const ShowDone = ({ count }: { count: number }) => (
  <button
    type="button"
    onClick={() => setHideDone(false)}
    className="flex h-8 items-center rounded-lg px-3 text-[13px] text-muted hover:bg-hover hover:text-fg"
  >
    {m.tasks_done_hidden({ count })}
  </button>
);
