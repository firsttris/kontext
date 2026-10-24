/**
 * One task to read and change: title, status, who, when, which board, steps, notes and what it is
 * about (mails, contacts). Every change is saved at once; text when leaving the field.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarDays, Check, ChevronLeft, Mail, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { shortAddress } from "@/lib/mail-accounts";
import { STATUS_LABELS, TASK_STATUSES, type Task } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import type { TaskPatch } from "../../../server/tasks/tasks";
import { useBoards, useMe, usePeople, useTaskActions } from "./queries";
import { TaskChecklist } from "./task-checklist";

const createdFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export const TaskDetail = ({ task, onClose }: { task: Task; onClose?: () => void }) => {
  const actions = useTaskActions();
  const toast = useToast();
  const navigate = useNavigate();
  const people = usePeople();
  const boards = useBoards();
  const me = useMe();
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [confirm, setConfirm] = useState(false);
  const done = task.status === "done";

  const save = async (patch: TaskPatch) => {
    try {
      await actions.update(task.id, patch);
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  const close = () =>
    onClose
      ? onClose()
      : void navigate({
          from: "/tasks",
          to: "/tasks",
          search: (prev) => ({ ...prev, task: undefined }),
        });

  const remove = async () => {
    try {
      await actions.remove(task.id);
      toast.show(m.tasks_deleted());
      close();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  const creator = people.find((person) => person.id === task.createdBy)?.name ?? "";

  return (
    <article aria-label={task.title} className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2 md:px-3">
        <button
          type="button"
          onClick={close}
          aria-label={m.mail_back()}
          className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-hover md:hidden"
        >
          <ChevronLeft size={20} />
        </button>
        <Button
          size="sm"
          variant={done ? "outline" : "primary"}
          onClick={() => void save({ status: done ? "open" : "done" })}
        >
          {done ? <RotateCcw size={14} /> : <Check size={14} />}
          {done ? m.tasks_reopen() : m.tasks_complete()}
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size={confirm ? "sm" : "icon"}
          aria-label={m.tasks_delete()}
          title={m.tasks_delete()}
          onClick={() => (confirm ? void remove() : setConfirm(true))}
          className={confirm ? "text-danger" : undefined}
        >
          <Trash2 size={15} />
          {confirm ? m.tasks_delete_really() : null}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex max-w-[720px] flex-col gap-5 px-5 py-5 md:px-8">
          <textarea
            aria-label={m.tasks_title_field()}
            value={title}
            rows={1}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
            onBlur={() =>
              title.trim() && title.trim() !== task.title && void save({ title: title.trim() })
            }
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              e.currentTarget.blur();
            }}
            className={cn(
              "field-sizing-content w-full resize-none border-0 bg-transparent p-0 text-[22px] leading-snug font-semibold tracking-tight text-fg outline-none",
              done && "text-muted line-through",
            )}
          />
          <fieldset className="m-0 flex flex-wrap gap-0.5 self-start rounded-[9px] border-0 bg-subtle p-[3px]">
            <legend className="sr-only">Status</legend>
            {TASK_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={task.status === status}
                onClick={() => void save({ status })}
                className={cn(
                  "h-7 rounded-[7px] px-3 text-[13px]",
                  task.status === status
                    ? "bg-bg font-medium text-fg shadow-sm"
                    : "text-muted hover:text-fg",
                )}
              >
                {STATUS_LABELS[status]()}
              </button>
            ))}
          </fieldset>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Label>
              {m.tasks_assignee()}
              <Select
                value={task.assigneeId ?? ""}
                onChange={(e) => void save({ assigneeId: e.target.value || null })}
              >
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
              <Select
                value={task.accountId}
                onChange={(e) => void save({ accountId: e.target.value })}
              >
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.isPersonal ? m.tasks_my_board() : shortAddress(board.name)}
                  </option>
                ))}
              </Select>
            </Label>
            <Label>
              {m.tasks_due()}
              <Input
                type="date"
                value={task.dueDate ?? ""}
                onChange={(e) =>
                  void save({
                    dueDate: e.target.value || null,
                    ...(e.target.value ? {} : { dueTime: null }),
                  })
                }
              />
            </Label>
            <Label>
              {m.tasks_time()}
              <Input
                type="time"
                value={task.dueTime ?? ""}
                disabled={!task.dueDate}
                onChange={(e) => void save({ dueTime: e.target.value || null })}
              />
            </Label>
          </div>
          <TaskChecklist
            items={task.checklist}
            onChange={(checklist) => void save({ checklist })}
          />
          <Label>
            {m.tasks_notes()}
            <Textarea
              value={notes}
              rows={4}
              placeholder={m.tasks_notes_placeholder()}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== task.notes && void save({ notes })}
            />
          </Label>
          {task.links.length ? (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-semibold tracking-wide text-muted uppercase">
                {m.tasks_links()}
              </span>
              {task.links.map((link) => (
                <Link
                  key={`${link.kind}-${link.ref}`}
                  to="/mail/$accountId/$mailboxId"
                  params={{ accountId: link.accountId, mailboxId: "inbox" }}
                  search={{ email: link.ref }}
                  className="flex items-center gap-3 rounded-[10px] border border-border px-3 py-2.5 text-fg no-underline hover:bg-hover"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    {link.kind === "event" ? <CalendarDays size={16} /> : <Mail size={16} />}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{link.label}</span>
                    {link.detail ? (
                      <span className="truncate text-[12px] text-muted">{link.detail}</span>
                    ) : null}
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
          <span className="text-[12px] text-muted">
            {m.tasks_created_by({
              name: creator || "—",
              when: createdFormat.format(new Date(task.createdAt)),
            })}
          </span>
        </div>
      </div>
    </article>
  );
};
