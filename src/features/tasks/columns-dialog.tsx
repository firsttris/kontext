/**
 * A board's columns: rename, add in between, change the order, remove. "Offen" stays first and
 * "Erledigt" last; tasks of a removed column go back to "Offen".
 */
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { type BoardColumn, columnLabel, newColumnId } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import { useColumns, useTaskActions } from "./queries";

const MAX_COLUMNS = 10;

export const ColumnsDialog = ({
  accountId,
  title,
  onClose,
}: {
  accountId: string;
  title: string;
  onClose: () => void;
}) => {
  const toast = useToast();
  const actions = useTaskActions();
  const current = useColumns(accountId);
  const [columns, setColumns] = useState<BoardColumn[]>(current);
  const [busy, setBusy] = useState(false);
  const fixed = (column: BoardColumn) => column.id === "open" || column.id === "done";

  const rename = (id: string, name: string) =>
    setColumns((list) => list.map((column) => (column.id === id ? { ...column, name } : column)));
  const move = (index: number, by: -1 | 1) =>
    setColumns((list) => {
      const next = [...list];
      [next[index], next[index + by]] = [next[index + by]!, next[index]!];
      return next;
    });
  const add = () =>
    setColumns((list) => {
      const name = m.tasks_column_new();
      const column = {
        id: newColumnId(
          name,
          list.map((c) => c.id),
        ),
        name,
      };
      return [...list.slice(0, -1), column, list.at(-1)!];
    });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    // A new column takes its id from the name it got.
    const taken: string[] = [];
    const named = columns.map((column) => {
      if (!column.id.startsWith("c-") || current.some((c) => c.id === column.id)) {
        taken.push(column.id);
        return column;
      }
      const id = newColumnId(column.name, [...taken, ...columns.map((c) => c.id)]);
      taken.push(id);
      return { ...column, id };
    });
    setBusy(true);
    try {
      await actions.setColumns(accountId, named);
      toast.show(m.tasks_columns_saved());
      onClose();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    } finally {
      setBusy(false);
    }
  };

  const movable = (index: number) => index > 0 && index < columns.length - 1;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={m.tasks_columns_title({ board: title })}
      description={m.tasks_columns_hint()}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {columns.map((column, index) => (
            <li key={column.id} className="flex items-center gap-1.5">
              <Input
                aria-label={m.tasks_column_name({ number: index + 1 })}
                value={column.name}
                placeholder={columnLabel({ ...column, name: "" })}
                required={column.id.startsWith("c-")}
                maxLength={40}
                onChange={(event) => rename(column.id, event.target.value)}
                className="h-9 flex-1"
              />
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={m.tasks_column_up({ name: columnLabel(column) })}
                disabled={!movable(index) || index === 1}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={15} />
              </Button>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={m.tasks_column_down({ name: columnLabel(column) })}
                disabled={!movable(index) || index === columns.length - 2}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={15} />
              </Button>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={m.tasks_column_remove({ name: columnLabel(column) })}
                disabled={fixed(column)}
                onClick={() => setColumns((list) => list.filter((c) => c.id !== column.id))}
              >
                <Trash2 size={15} />
              </Button>
            </li>
          ))}
        </ol>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={columns.length >= MAX_COLUMNS}
          onClick={add}
        >
          <Plus size={14} /> {m.tasks_column_add()}
        </Button>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {m.tasks_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {m.company_save()}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
