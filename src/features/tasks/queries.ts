/**
 * Tasks from Kontext's server (/api/tasks): all of them in one list, refreshed when the live
 * connection says a board changed (features/live) and when the window comes back. Changes are
 * shown at once and corrected if the server says otherwise.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/components/shell/app-shell";
import { CAPABILITIES } from "@/jmap/client";
import type { NewTask, Task } from "@/lib/tasks";
import type { TaskPatch } from "../../../server/tasks/tasks";
import { useMailAccounts } from "../mail/queries";
import { usePrincipals } from "../sharing/queries";

const KEY = ["tasks"];

const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/tasks${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

export const useTasks = () => {
  const { data, isPending } = useQuery({
    queryKey: KEY,
    queryFn: async () => (await send<{ tasks: Task[] }>("GET", "")).tasks,
  });
  return { tasks: data ?? [], isPending };
};

/** The signed-in person: their own account id, which is also how tasks are assigned. */
export const useMe = (): string => {
  const { data: session } = useSession();
  return session?.primaryAccounts[CAPABILITIES.mail] ?? "";
};

/** The company's people, to assign a task to. */
export const usePeople = (): { id: string; name: string }[] => {
  const { data = [] } = usePrincipals();
  return (
    data
      .filter((principal) => principal.type === "individual")
      // The full name where Stalwart has one ("Jonas Weber"), else the login.
      .map((principal) => ({
        id: principal.id,
        name: principal.description || principal.name || principal.email || "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"))
  );
};

/** Where tasks can live: the own mailbox and the shared ones one may write to. */
export const useBoards = () =>
  useMailAccounts()
    .filter((account) => !account.isReadOnly)
    .map((account) => ({ id: account.id, name: account.name, isPersonal: account.isPersonal }));

export const useTaskActions = () => {
  const queryClient = useQueryClient();
  const settle = () => queryClient.invalidateQueries({ queryKey: KEY });
  const patchCache = (change: (tasks: Task[]) => Task[]) =>
    queryClient.setQueryData<Task[]>(KEY, (tasks) => change(tasks ?? []));

  const create = useMutation({
    mutationFn: async (task: NewTask) => (await send<{ task: Task }>("POST", "", task)).task,
    onSuccess: (task) => patchCache((tasks) => [...tasks, task]),
    onSettled: settle,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TaskPatch }) =>
      (await send<{ task: Task }>("PATCH", `/${encodeURIComponent(id)}`, patch)).task,
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      patchCache((tasks) =>
        tasks.map((task) =>
          task.id === id
            ? {
                ...task,
                ...patch,
                completedAt:
                  patch.status === undefined
                    ? task.completedAt
                    : patch.status === "done"
                      ? (task.completedAt ?? new Date().toISOString())
                      : null,
              }
            : task,
        ),
      );
    },
    onSettled: settle,
  });

  const remove = useMutation({
    mutationFn: (id: string) => send<{ ok: true }>("DELETE", `/${encodeURIComponent(id)}`),
    onMutate: (id) => patchCache((tasks) => tasks.filter((task) => task.id !== id)),
    onSettled: settle,
  });

  return {
    create: (task: NewTask) => create.mutateAsync(task),
    update: (id: string, patch: TaskPatch) => update.mutateAsync({ id, patch }),
    remove: (id: string) => remove.mutateAsync(id),
  };
};
