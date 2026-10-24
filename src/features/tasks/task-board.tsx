/**
 * The board of one account: a column per status, cards in their order. Cards are dragged between
 * and within columns (the new place is set between its neighbours); on a phone the columns scroll
 * sideways and the status is changed in the task.
 */
import { Link } from "@tanstack/react-router";
import { Mail, Plus } from "lucide-react";
import { type DragEvent, type FormEvent, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { dateKey } from "@/lib/jscalendar";
import {
  column,
  dueLabel,
  parseQuickAdd,
  positionBetween,
  STATUS_LABELS,
  TASK_STATUSES,
  type Task,
  type TaskStatus,
} from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import { usePeople, useTaskActions } from "./queries";
import { dueTone } from "./task-row";

const DOTS: Record<TaskStatus, string> = {
  open: "bg-zinc-400",
  doing: "bg-blue-500",
  waiting: "bg-amber-500",
  done: "bg-emerald-500",
};

type Drop = { status: TaskStatus; index: number };

export const TaskBoard = ({
  accountId,
  tasks,
  openId,
}: {
  accountId: string;
  tasks: Task[];
  openId: string | undefined;
}) => {
  const today = dateKey(new Date());
  const actions = useTaskActions();
  const toast = useToast();
  const people = usePeople();
  const [dragged, setDragged] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [adding, setAdding] = useState<TaskStatus | null>(null);
  const [entry, setEntry] = useState("");

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  /** Above or below a card's middle: before it, or after it. */
  const overCard = (event: DragEvent, status: TaskStatus, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    const box = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > box.top + box.height / 2;
    setDrop({ status, index: index + (after ? 1 : 0) });
  };

  const place = (status: TaskStatus, index: number) => {
    const id = dragged;
    setDragged(null);
    setDrop(null);
    if (!id) return;
    const others = column(tasks, status).filter((task) => task.id !== id);
    const position = positionBetween(others[index - 1]?.position, others[index]?.position);
    void run(() => actions.update(id, { status, position }));
  };

  const add = (event: FormEvent, status: TaskStatus) => {
    event.preventDefault();
    if (!entry.trim()) return;
    const { title, dueDate } = parseQuickAdd(entry, today);
    setEntry("");
    void run(() => actions.create({ accountId, title, dueDate, status }));
  };

  return (
    <div className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto bg-side px-4 py-4 md:grid md:snap-none md:grid-cols-4 md:overflow-x-visible md:px-6">
      {TASK_STATUSES.map((status) => {
        const cards = column(tasks, status).filter((task) => task.id !== dragged || drop === null);
        const label = STATUS_LABELS[status]();
        return (
          <section
            key={status}
            aria-label={label}
            onDragOver={(event) => {
              event.preventDefault();
              if (drop?.status !== status) setDrop({ status, index: cards.length });
            }}
            onDrop={(event) => {
              event.preventDefault();
              place(status, drop?.status === status ? drop.index : cards.length);
            }}
            className="flex w-[82vw] shrink-0 snap-start flex-col gap-2 self-start rounded-[14px] bg-subtle p-2.5 md:w-auto"
          >
            <h2 className="m-0 flex items-center gap-2 px-1 pt-0.5 pb-1 text-[13px] font-semibold">
              <span aria-hidden="true" className={cn("size-2 rounded-full", DOTS[status])} />
              {label}
              <span className="font-mono text-[12px] font-normal text-muted">
                {column(tasks, status).length}
              </span>
            </h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {cards.map((task, index) => {
                const assignee = people.find((person) => person.id === task.assigneeId)?.name;
                const mail = task.links.find((link) => link.kind === "mail");
                return (
                  <li key={task.id} className="flex flex-col gap-2">
                    {drop?.status === status && drop.index === index ? <DropMark /> : null}
                    <Link
                      to="/tasks"
                      from="/tasks"
                      search={(prev) => ({ ...prev, task: task.id })}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", task.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDragged(task.id);
                      }}
                      onDragEnd={() => {
                        setDragged(null);
                        setDrop(null);
                      }}
                      onDragOver={(event) => overCard(event, status, index)}
                      className={cn(
                        "flex flex-col gap-2 rounded-[10px] border border-border bg-bg p-3 text-fg no-underline shadow-sm hover:border-muted",
                        task.id === openId && "ring-2 ring-accent",
                        task.id === dragged && "opacity-40",
                        status === "done" && "opacity-70",
                      )}
                    >
                      <span
                        className={cn(
                          "leading-snug font-medium",
                          status === "done" && "line-through",
                        )}
                      >
                        {task.title}
                      </span>
                      {mail ? (
                        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
                          <Mail size={12} className="shrink-0" aria-hidden="true" />
                          <span className="truncate">{mail.detail || mail.label}</span>
                        </span>
                      ) : null}
                      {task.dueDate || assignee || task.checklist.length ? (
                        <span className="flex items-center gap-2 text-[12px]">
                          {task.dueDate ? (
                            <span
                              className={cn(
                                "rounded-md bg-subtle px-1.5 py-0.5 font-medium",
                                dueTone(task, today),
                              )}
                            >
                              {dueLabel(task.dueDate, task.dueTime, today)}
                            </span>
                          ) : null}
                          {task.checklist.length ? (
                            <span className="font-mono text-muted">
                              {task.checklist.filter((item) => item.done).length}/
                              {task.checklist.length}
                            </span>
                          ) : null}
                          <span className="flex-1" />
                          {assignee ? <Avatar name={assignee} size={22} /> : null}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {drop?.status === status && drop.index >= cards.length ? <DropMark /> : null}
            {adding === status ? (
              <form onSubmit={(event) => add(event, status)}>
                <input
                  autoFocus
                  aria-label={m.tasks_add_to_column({ column: label })}
                  placeholder={m.tasks_title_field()}
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                  onBlur={() => !entry.trim() && setAdding(null)}
                  className="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[14px] outline-none focus:border-muted"
                />
              </form>
            ) : (
              <button
                type="button"
                aria-label={m.tasks_add_to_column({ column: label })}
                onClick={() => setAdding(status)}
                className="flex h-8 items-center gap-1.5 rounded-lg px-1.5 text-[13px] text-muted hover:bg-hover hover:text-fg"
              >
                <Plus size={14} /> {m.tasks_from_mail()}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
};

const DropMark = () => (
  <div
    aria-hidden="true"
    className="h-14 rounded-[10px] border-[1.5px] border-dashed border-accent bg-accent/5"
  />
);
