/**
 * A contact's tasks: those linked to the card and those about mails with them, to tick off in
 * place; "Aufgabe" makes a new one linked to the card.
 */
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { dateKey } from "@/lib/jscalendar";
import { contactLink, tasksOfContact } from "@/lib/task-context";
import { m } from "@/paraglide/messages";
import { usePeople, useTaskActions, useTasks } from "../tasks/queries";
import { TaskDialog, type TaskStart } from "../tasks/task-dialog";
import { TaskRow } from "../tasks/task-row";
import type { Contact } from "./queries";

const SHOWN = 6;

export const ContactTasks = ({
  card,
  name,
  email,
  threadIds,
}: {
  card: Contact;
  name: string;
  email: string;
  /** The conversations of the mails with them that are loaded. */
  threadIds: ReadonlySet<string>;
}) => {
  const { tasks } = useTasks();
  const people = usePeople();
  const actions = useTaskActions();
  const toast = useToast();
  const [start, setStart] = useState<TaskStart | null>(null);
  const today = dateKey(new Date());
  // Finished ones only from today: what was just ticked off stays to be seen.
  const list = tasksOfContact(tasks, card, threadIds).filter(
    (task) =>
      task.status !== "done" ||
      (task.completedAt !== null && dateKey(new Date(task.completedAt)) === today),
  );

  return (
    <section aria-label={m.contacts_tasks()} className="flex flex-col gap-2">
      <div className="flex items-center gap-2 border-b border-border pb-1.5">
        <h3 className="m-0 flex-1 text-[14px] font-semibold">{m.contacts_tasks()}</h3>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            setStart({
              title: "",
              accountId: card.accountId,
              link: contactLink(card, name, email),
            })
          }
        >
          <Plus size={14} /> {m.contacts_new_task()}
        </Button>
      </div>
      {list.length === 0 ? (
        <p className="m-0 text-[14px] text-muted">{m.contacts_no_tasks()}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {list.slice(0, SHOWN).map((task) => (
            <li key={task.id} className="-mx-3">
              <TaskRow
                task={task}
                today={today}
                active={false}
                board={null}
                assignee={people.find((person) => person.id === task.assigneeId)?.name ?? null}
                inTasks={false}
                onToggle={() =>
                  void actions
                    .update(task.id, { status: task.status === "done" ? "open" : "done" })
                    .catch((error: Error) =>
                      toast.show(m.common_error({ message: error.message }), "error"),
                    )
                }
              />
            </li>
          ))}
        </ul>
      )}
      {start ? <TaskDialog starts={[start]} onClose={() => setStart(null)} /> : null}
    </section>
  );
};
