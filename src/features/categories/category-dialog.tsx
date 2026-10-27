/**
 * The categories of one mailbox: rename, recolour, remove, add. A removed category stays on the
 * mails as a keyword but is no longer shown; added again under its name, it comes back.
 */
import * as Popover from "@radix-ui/react-popover";
import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  addCategory,
  CATEGORY_COLORS,
  type Category,
  type CategoryColor,
  COLOR_NAMES,
  COLOR_STYLES,
  changeCategory,
  removeCategory,
} from "@/lib/categories";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { useCategories, useSaveCategories } from "./queries";

const ColorPicker = ({
  name,
  color,
  onChange,
}: {
  name: string;
  color: CategoryColor;
  onChange: (color: CategoryColor) => void;
}) => (
  <Popover.Root>
    <Popover.Trigger
      aria-label={m.categories_color({ name })}
      className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-hover"
    >
      <span className={cn("size-3.5 rounded-full", COLOR_STYLES[color].dot)} />
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        align="start"
        sideOffset={6}
        className="z-[60] grid grid-cols-4 gap-1 rounded-xl border border-border bg-bg p-2 shadow-lg"
      >
        {CATEGORY_COLORS.map((candidate) => (
          <Popover.Close
            key={candidate}
            aria-label={COLOR_NAMES[candidate]()}
            aria-pressed={candidate === color}
            onClick={() => onChange(candidate)}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg hover:bg-hover",
              candidate === color && "ring-2 ring-border",
            )}
          >
            <span className={cn("size-4 rounded-full", COLOR_STYLES[candidate].dot)} />
          </Popover.Close>
        ))}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
);

export const CategoryDialog = ({
  accountId,
  mailbox,
  onClose,
}: {
  accountId: string;
  /** The mailbox's address, for the title. */
  mailbox: string;
  onClose: () => void;
}) => {
  const toast = useToast();
  const saved = useCategories(accountId);
  const save = useSaveCategories(accountId);
  const [list, setList] = useState<Category[]>(saved);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setList((current) => addCategory(current, name));
    setName("");
  };

  const submit = async () => {
    try {
      await save.mutateAsync(list.map((category) => ({ ...category, name: category.name.trim() })));
      toast.show(m.categories_saved());
      onClose();
    } catch (error) {
      setProblem(m.common_error({ message: (error as Error).message }));
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={m.categories_dialog_title({ mailbox })}
      description={m.categories_dialog_hint()}
    >
      {list.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {list.map((category) => (
            <li key={category.keyword} className="flex items-center gap-2">
              <ColorPicker
                name={category.name}
                color={category.color}
                onChange={(color) =>
                  setList((current) => changeCategory(current, category.keyword, { color }))
                }
              />
              <Input
                aria-label={m.categories_name({ name: category.name })}
                value={category.name}
                maxLength={40}
                onChange={(e) =>
                  setList((current) =>
                    changeCategory(current, category.keyword, { name: e.target.value }),
                  )
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={m.categories_remove({ name: category.name })}
                onClick={() => setList((current) => removeCategory(current, category.keyword))}
              >
                <Trash2 size={15} />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] text-muted">{m.categories_none()}</p>
      )}
      <form onSubmit={add} className="flex gap-2">
        <Input
          aria-label={m.categories_new()}
          placeholder={m.categories_new_placeholder()}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={!name.trim()}>
          <Plus size={15} /> {m.categories_add()}
        </Button>
      </form>
      {problem ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {problem}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={onClose}>
          {m.rules_cancel()}
        </Button>
        <Button
          variant="primary"
          disabled={save.isPending || list.some((category) => !category.name.trim())}
          onClick={() => void submit()}
        >
          {m.contacts_save()}
        </Button>
      </div>
    </Dialog>
  );
};
