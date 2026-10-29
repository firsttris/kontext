/**
 * "Erinnern": when the assignee gets a push about the task – choices from its due day and time,
 * or a time picked by hand. The server sends it, also with Kontext closed (server/tasks/notices.ts).
 */
import { useState } from "react";
import { Input, Label, Select } from "@/components/ui/input";
import { fromLocal, toLocal } from "@/lib/jscalendar";
import { reminderChoices, reminderKey } from "@/lib/task-reminders";
import type { Task } from "@/lib/tasks";
import { m } from "@/paraglide/messages";

export const TaskReminder = ({
  task,
  onChange,
}: {
  /** The task, or the one being made in "Neue Aufgabe". */
  task: Pick<Task, "dueDate" | "dueTime" | "remindAt">;
  onChange: (remindAt: string | null) => void;
}) => {
  const choices = reminderChoices(task, new Date());
  const current = reminderKey(task.remindAt, choices);
  const [custom, setCustom] = useState(current === "custom");
  const key = custom ? "custom" : current;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Label>
        {m.tasks_remind()}
        <Select
          value={key}
          onChange={(e) => {
            const value = e.target.value;
            setCustom(value === "custom");
            if (value === "custom") return;
            const choice = choices.find((entry) => entry.key === value);
            onChange(choice ? choice.at.toISOString() : null);
          }}
        >
          <option value="">{m.tasks_remind_none()}</option>
          {choices.map((choice) => (
            <option key={choice.key} value={choice.key}>
              {choice.label}
            </option>
          ))}
          <option value="custom">{m.tasks_remind_custom()}</option>
        </Select>
      </Label>
      {key === "custom" ? (
        <Label>
          {m.tasks_remind_when()}
          <Input
            type="datetime-local"
            value={task.remindAt ? toLocal(new Date(task.remindAt)).slice(0, 16) : ""}
            onChange={(e) =>
              onChange(e.target.value ? fromLocal(`${e.target.value}:00`).toISOString() : null)
            }
          />
        </Label>
      ) : (
        <p className="m-0 self-end pb-2 text-[12px] text-muted">{m.tasks_remind_hint()}</p>
      )}
    </div>
  );
};
