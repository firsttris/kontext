/**
 * A contact's tasks: those linked to the card and those about mails with them – any mail a task
 * links to, in the own or a shared mailbox, that they sent or got – to tick off in place;
 * "Aufgabe" makes a new one linked to the card.
 */

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useClient } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { participants } from "@/jmap/correspondence";
import { dateKey } from "@/lib/jscalendar";
import { allEmails } from "@/lib/jscontact";
import { contactLink, linkedMails, mailsWith, tasksOfContact } from "@/lib/task-context";
import type { Task } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import { useMailAccounts } from "../mail/queries";
import { usePeople, useTaskActions, useTasks } from "../tasks/queries";
import { TaskDialog, type TaskStart } from "../tasks/task-dialog";
import { TaskRow } from "../tasks/task-row";
import type { Contact } from "./queries";

const SHOWN = 6;

/** The mails tasks link to that were with these addresses, by `mailKey`. */
const useMailsWith = (tasks: Task[], addresses: string[]): ReadonlySet<string> => {
  const client = useClient();
  const accountIds = useMailAccounts().map((account) => account.id);
  const ids = linkedMails(tasks, accountIds);
  const { data = [] } = useQuery({
    // Sorted: the same mails, whatever order the tasks came in, ask once.
    queryKey: [
      "tasks",
      "linked-mails",
      Object.entries(ids)
        .map(([accountId, list]) => [accountId, [...list].sort()])
        .sort(),
    ],
    queryFn: () => participants(client, ids),
    enabled: Object.keys(ids).length > 0,
    staleTime: 5 * 60_000,
  });
  const key = addresses.join(",");
  return useMemo(() => mailsWith(data, key ? key.split(",") : []), [data, key]);
};

export const ContactTasks = ({
  card,
  name,
  email,
}: {
  card: Contact;
  name: string;
  email: string;
}) => {
  const { tasks } = useTasks();
  const mailKeys = useMailsWith(tasks, allEmails(card));
  const people = usePeople();
  const actions = useTaskActions();
  const toast = useToast();
  const [start, setStart] = useState<TaskStart | null>(null);
  const today = dateKey(new Date());
  // Finished ones only from today: what was just ticked off stays to be seen.
  const list = tasksOfContact(tasks, card, mailKeys).filter(
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
