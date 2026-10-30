/**
 * Tasks from Kontext's server (/api/tasks): all of them in one list with the boards' columns and
 * the projects (further boards of an account), refreshed when the live
 * connection says a board changed (features/live) and when the window comes back. Changes are
 * shown at once and corrected if the server says otherwise.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/components/shell/app-shell";
import { CAPABILITIES } from "@/jmap/client";
import {
  type BoardColumn,
  boardKey,
  columnLabel,
  DEFAULT_COLUMNS,
  type NewTask,
  type Task,
} from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import type { TaskPatch, TaskProject } from "../../../server/tasks/tasks";
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

type TasksData = {
  tasks: Task[];
  projects: TaskProject[];
  /** Columns by board key: an account id, or a project id. */
  boards: Record<string, BoardColumn[]>;
};

const useTasksData = () => useQuery({ queryKey: KEY, queryFn: () => send<TasksData>("GET", "") });

export const useTasks = () => {
  const { data, isPending } = useTasksData();
  return { tasks: data?.tasks ?? [], isPending };
};

/** A board's columns (by its key), the built-in ones until it has its own. */
export const useColumns = (key: string): BoardColumn[] =>
  useTasksData().data?.boards[key] ?? DEFAULT_COLUMNS;

/** The name of a task's column on its board ("In Arbeit", "Bestellt"). */
export const useStatusLabel = () => {
  const boards = useTasksData().data?.boards ?? {};
  return (task: Pick<Task, "accountId" | "projectId" | "status">) => {
    const column = (boards[boardKey(task)] ?? DEFAULT_COLUMNS).find((c) => c.id === task.status);
    return column ? columnLabel(column) : columnLabel({ id: "open", name: "" });
  };
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

/**
 * A board tasks can be put on: a mailbox's own, or one of its projects. `id` is its key
 * (`boardKey`), `name` what it is called, `label` that with the mailbox for a project.
 */
export type Board = {
  id: string;
  accountId: string;
  projectId: string | null;
  name: string;
  /** The mailbox's board: "Mein Board", or the shared mailbox's name. */
  mailbox: string;
  label: string;
  isPersonal: boolean;
};

/** Where tasks can live: the own mailbox and the shared ones one may write to, each with its projects. */
export const useBoards = (): Board[] => {
  const projects = useTasksData().data?.projects ?? [];
  return useMailAccounts()
    .filter((account) => !account.isReadOnly)
    .flatMap((account) => {
      const mailbox = account.isPersonal ? m.tasks_my_board() : account.name;
      const own = { accountId: account.id, mailbox, isPersonal: account.isPersonal };
      return [
        { ...own, id: account.id, projectId: null, name: mailbox, label: mailbox },
        ...projects
          .filter((project) => project.accountId === account.id)
          .map((project) => ({
            ...own,
            id: project.id,
            projectId: project.id,
            name: project.name,
            label: m.tasks_board_in({ mailbox, board: project.name }),
          })),
      ];
    });
};

/**
 * Whether a task's board is one of mine to write to. One given to me on a colleague's own board
 * is changed there, but not moved or deleted.
 */
export const useOnMyBoards = () => {
  const boards = useBoards();
  return (task: Pick<Task, "accountId">) =>
    boards.some((board) => board.accountId === task.accountId);
};

export const useTaskActions = () => {
  const queryClient = useQueryClient();
  const settle = () => queryClient.invalidateQueries({ queryKey: KEY });
  const patchCache = (change: (tasks: Task[]) => Task[]) =>
    queryClient.setQueryData<TasksData>(KEY, (data) =>
      data ? { ...data, tasks: change(data.tasks) } : data,
    );

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

  const columns = useMutation({
    mutationFn: ({ key, columns }: { key: string; columns: BoardColumn[] }) =>
      send<{ columns: BoardColumn[] }>("PUT", `/boards/${encodeURIComponent(key)}`, {
        columns,
      }),
    onMutate: ({ key, columns }) =>
      queryClient.setQueryData<TasksData>(KEY, (data) =>
        data ? { ...data, boards: { ...data.boards, [key]: columns } } : data,
      ),
    onSettled: settle,
  });

  const createProject = useMutation({
    mutationFn: async (project: { accountId: string; name: string }) =>
      (await send<{ project: TaskProject }>("POST", "/projects", project)).project,
    onSuccess: (project) =>
      queryClient.setQueryData<TasksData>(KEY, (data) =>
        data ? { ...data, projects: [...data.projects, project] } : data,
      ),
    onSettled: settle,
  });

  const renameProject = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      send<{ ok: true }>("PATCH", `/projects/${encodeURIComponent(id)}`, { name }),
    onMutate: ({ id, name }) =>
      queryClient.setQueryData<TasksData>(KEY, (data) =>
        data
          ? { ...data, projects: data.projects.map((p) => (p.id === id ? { ...p, name } : p)) }
          : data,
      ),
    onSettled: settle,
  });

  const removeProject = useMutation({
    mutationFn: (id: string) => send<{ ok: true }>("DELETE", `/projects/${encodeURIComponent(id)}`),
    onSettled: settle,
  });

  return {
    setColumns: (key: string, value: BoardColumn[]) => columns.mutateAsync({ key, columns: value }),
    createProject: (accountId: string, name: string) =>
      createProject.mutateAsync({ accountId, name }),
    renameProject: (id: string, name: string) => renameProject.mutateAsync({ id, name }),
    removeProject: (id: string) => removeProject.mutateAsync(id),
    create: (task: NewTask) => create.mutateAsync(task),
    update: (id: string, patch: TaskPatch) => update.mutateAsync({ id, patch }),
    remove: (id: string) => remove.mutateAsync(id),
  };
};
