/** A task's small steps to tick off. */
import { Plus, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { m } from "@/paraglide/messages";
import type { CheckItem } from "../../../server/tasks/tasks";

export const TaskChecklist = ({
  items,
  onChange,
}: {
  items: CheckItem[];
  onChange: (items: CheckItem[]) => void;
}) => {
  const [entry, setEntry] = useState("");
  const done = items.filter((item) => item.done).length;
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!entry.trim()) return;
    onChange([...items, { id: crypto.randomUUID(), text: entry.trim(), done: false }]);
    setEntry("");
  };
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">
        {items.length
          ? m.tasks_checklist_count({ done, total: items.length })
          : m.tasks_checklist()}
      </legend>
      {items.map((item) => (
        <div key={item.id} className="group flex items-center gap-2.5">
          <label className="flex min-w-0 flex-1 items-center gap-2.5 text-[14px]">
            <input
              type="checkbox"
              checked={item.done}
              onChange={() =>
                onChange(
                  items.map((other) =>
                    other.id === item.id ? { ...other, done: !other.done } : other,
                  ),
                )
              }
              className="size-4 accent-[var(--primary)]"
            />
            <span className={item.done ? "text-muted line-through" : undefined}>{item.text}</span>
          </label>
          <button
            type="button"
            aria-label={m.tasks_checklist_remove({ text: item.text })}
            onClick={() => onChange(items.filter((other) => other.id !== item.id))}
            className="flex size-7 items-center justify-center rounded-md text-muted opacity-0 group-hover:opacity-100 hover:bg-hover focus-visible:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <form onSubmit={add} className="flex items-center gap-2.5 text-muted">
        <Plus size={16} aria-hidden="true" />
        <input
          aria-label={m.tasks_checklist_add()}
          placeholder={m.tasks_checklist_add()}
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          className="h-8 min-w-0 flex-1 border-0 bg-transparent text-[14px] text-fg outline-none"
        />
      </form>
    </fieldset>
  );
};
