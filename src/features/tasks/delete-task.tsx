/**
 * Deleting a task, from the open task and from a row of the list: the bin, then "Wirklich
 * löschen?" in red, so one click alone deletes nothing; leaving the button calls it off.
 */
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { useTaskActions } from "./queries";

/** Deletes a task and says so; resolves to whether it went. */
export const useDeleteTask = () => {
  const actions = useTaskActions();
  const toast = useToast();
  return async (id: string): Promise<boolean> => {
    try {
      await actions.remove(id);
      toast.show(m.tasks_deleted());
      return true;
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
      return false;
    }
  };
};

export const DeleteTaskButton = ({
  label,
  onDelete,
  className,
}: {
  label: string;
  onDelete: () => void;
  className?: string;
}) => {
  const [confirm, setConfirm] = useState(false);
  return (
    <Button
      variant={confirm ? "danger" : "ghost"}
      size={confirm ? "sm" : "iconSm"}
      // The bin alone needs a name; asking, the button says it itself.
      aria-label={confirm ? undefined : label}
      title={label}
      onClick={() => (confirm ? onDelete() : setConfirm(true))}
      onBlur={() => setConfirm(false)}
      onMouseLeave={() => setConfirm(false)}
      className={cn(className, confirm && "md:opacity-100")}
    >
      <Trash2 size={15} />
      {confirm ? m.tasks_delete_really() : null}
    </Button>
  );
};
