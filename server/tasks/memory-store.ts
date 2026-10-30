/**
 * The task store in memory, enough for the routes of tasks and CalDAV: for their tests, and for
 * the demo, which runs the routes in the browser (src/demo). `start` is the first timestamp.
 */
import { sampleTask } from "./sample-task";
import type { Board, DavTask, TaskStore } from "./store";
import { type BoardColumn, boardKey, DEFAULT_COLUMNS, type Task, type TaskProject } from "./tasks";

export const memoryTaskStore = (start = Date.parse("2026-10-25T08:00:00Z")) => {
  const tasks: Task[] = [];
  const boards: Record<string, BoardColumn[]> = {};
  const projects: TaskProject[] = [];
  const onBoard = (task: Task, board: Board) => boardKey(task) === boardKey(board);
  const dav = new Map<string, { name: string; uid: string }>();
  let clock = start;
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
    setColumns: async (board, columns) => {
      boards[boardKey(board)] = columns;
      for (const task of tasks) {
        if (onBoard(task, board) && !columns.some((c) => c.id === task.status)) {
          task.status = "open";
        }
      }
    },
    projects: async (accountIds, ids = []) =>
      projects.filter((p) => accountIds.includes(p.accountId) || ids.includes(p.id)),
    createProject: async (accountId, name) => {
      const project = { id: `p-${projects.length + 1}`, accountId, name };
      projects.push(project);
      return project;
    },
    renameProject: async (id, name) => {
      const project = projects.find((p) => p.id === id);
      if (project) project.name = name;
    },
    removeProject: async (id) => {
      const index = projects.findIndex((p) => p.id === id);
      if (index < 0) return;
      const [project] = projects.splice(index, 1);
      const kept = boards[project!.accountId] ?? DEFAULT_COLUMNS;
      for (const task of tasks.filter((t) => t.projectId === id)) {
        task.projectId = null;
        if (!kept.some((c) => c.id === task.status)) task.status = "open";
      }
    },
    davList: async (board) => tasks.filter((t) => onBoard(t, board)).map(davOf),
    davGet: async (board, name) => {
      const task = tasks.find((t) => onBoard(t, board) && davOf(t).name === name);
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
