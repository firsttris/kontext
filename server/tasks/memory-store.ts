/** Tests only: the task store in memory, enough for the routes of tasks and CalDAV. */
import { sampleTask } from "./sample-task";
import type { DavTask, TaskStore } from "./store";
import { type BoardColumn, DEFAULT_COLUMNS, type Task } from "./tasks";

export const memoryTaskStore = () => {
  const tasks: Task[] = [];
  const boards: Record<string, BoardColumn[]> = {};
  const dav = new Map<string, { name: string; uid: string }>();
  let clock = Date.parse("2026-10-25T08:00:00Z");
  const stamp = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };
  const davOf = (task: Task): DavTask => ({
    task,
    name: dav.get(task.id)?.name ?? task.id,
    uid: dav.get(task.id)?.uid ?? task.id,
  });
  const create: TaskStore["create"] = async (data, createdBy) => {
    const at = stamp();
    const task = sampleTask({
      ...data,
      id: `t${tasks.length + 1}`,
      position: 1,
      createdBy,
      assignedBy: data.assigneeId ? createdBy : null,
      createdAt: at,
      updatedAt: at,
      completedAt: data.status === "done" ? at : null,
    });
    tasks.push(task);
    return task;
  };
  const store: TaskStore = {
    list: async (ids, _since, me) =>
      tasks.filter((task) => ids.includes(task.accountId) || task.assigneeId === me),
    get: async (id) => tasks.find((task) => task.id === id) ?? null,
    create,
    update: async (id, patch, by) => {
      const task = tasks.find((candidate) => candidate.id === id)!;
      if (patch.assigneeId !== undefined && patch.assigneeId !== task.assigneeId) {
        task.assignedBy = patch.assigneeId ? by : null;
      }
      Object.assign(task, patch, { updatedAt: stamp() });
      return task;
    },
    remove: async (id) => {
      tasks.splice(
        tasks.findIndex((task) => task.id === id),
        1,
      );
    },
    dueReminders: async () => [],
    markReminded: async () => undefined,
    columns: async (ids) =>
      Object.fromEntries(ids.map((id) => [id, boards[id] ?? DEFAULT_COLUMNS])),
    setColumns: async (accountId, columns) => {
      boards[accountId] = columns;
      for (const task of tasks) {
        if (task.accountId === accountId && !columns.some((c) => c.id === task.status)) {
          task.status = "open";
        }
      }
    },
    davList: async (accountId) => tasks.filter((t) => t.accountId === accountId).map(davOf),
    davGet: async (accountId, name) => {
      const task = tasks.find((t) => t.accountId === accountId && davOf(t).name === name);
      return task ? davOf(task) : null;
    },
    davCreate: async (data, createdBy, name, uid) => {
      const task = await create(data, createdBy);
      dav.set(task.id, { name, uid });
      return task;
    },
  };
  return { tasks, store };
};
