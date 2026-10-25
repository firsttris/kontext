// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { SessionAccount } from "../categories/routes";
import type { Notice } from "../push/pusher";
import { createTaskRoutes } from "./routes";
import { sampleTask } from "./sample-task";
import type { TaskStore } from "./store";
import type { Task } from "./tasks";

const accounts: SessionAccount[] = [
  { id: "jonas", isPersonal: true, isReadOnly: false },
  { id: "info", isPersonal: false, isReadOnly: false },
];

const lea: SessionAccount[] = [
  { id: "lea", isPersonal: true, isReadOnly: false },
  { id: "info", isPersonal: false, isReadOnly: false },
];

const setup = () => {
  const tasks: Task[] = [];
  let signedIn = accounts;
  const store: TaskStore = {
    list: async (ids, _since, me) =>
      tasks.filter((task) => ids.includes(task.accountId) || task.assigneeId === me),
    get: async (id) => tasks.find((task) => task.id === id) ?? null,
    create: async (data, createdBy) => {
      const task = sampleTask({
        ...data,
        id: `t${tasks.length + 1}`,
        position: 1,
        createdBy,
        assignedBy: data.assigneeId ? createdBy : null,
      });
      tasks.push(task);
      return task;
    },
    update: async (id, patch, by) => {
      const task = tasks.find((candidate) => candidate.id === id)!;
      if (patch.assigneeId !== undefined && patch.assigneeId !== task.assigneeId) {
        task.assignedBy = patch.assigneeId ? by : null;
      }
      Object.assign(task, patch);
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
  };
  const sent: [string[], Notice][] = [];
  const changes: [string, string[]][] = [];
  const app = createTaskRoutes({
    store,
    accountsOf: async () => signedIn,
    changed: (accountId, assignees) => changes.push([accountId, assignees]),
    notify: async (ids, notice) => {
      sent.push([ids, notice]);
    },
    nameOf: async () => "Jonas Weber",
  });
  const call = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const as = (who: SessionAccount[]) => {
    signedIn = who;
  };
  return { tasks, sent, changes, call, as };
};

describe("task routes", () => {
  it("tells a colleague of a task given to them, not oneself", async () => {
    const { sent, call } = setup();
    await call("POST", "/", { accountId: "info", title: "Angebot schicken", assigneeId: "jonas" });
    expect(sent).toHaveLength(0);
    await call("POST", "/", { accountId: "info", title: "Rückruf Hoffmann", assigneeId: "lea" });
    expect(sent).toHaveLength(1);
    expect(sent[0]![0]).toEqual(["lea"]);
    expect(sent[0]![1].title).toBe("Jonas Weber hat dir eine Aufgabe gegeben");
  });

  it("tells only when the assignee changes", async () => {
    const { tasks, sent, call } = setup();
    await call("POST", "/", { accountId: "info", title: "Wartung" });
    await call("PATCH", "/t1", { assigneeId: "lea" });
    await call("PATCH", "/t1", { title: "Wartung bestätigen" });
    expect(sent.map(([ids]) => ids)).toEqual([["lea"]]);
    expect(tasks[0]!.assignedBy).toBe("jonas");
  });

  it("takes a reminder time", async () => {
    const { tasks, call } = setup();
    const response = await call("POST", "/", {
      accountId: "jonas",
      title: "Zahnarzt",
      remindAt: "2026-10-26T07:00:00.000Z",
    });
    expect(response.status).toBe(201);
    expect(tasks[0]!.remindAt).toBe("2026-10-26T07:00:00.000Z");
    const bad = await call("POST", "/", { accountId: "jonas", title: "x", remindAt: "morgen" });
    expect(bad.status).toBe(400);
  });

  it("whom it is given to sees and changes it on a colleague's own board, not deletes it", async () => {
    const { tasks, changes, call, as } = setup();
    await call("POST", "/", { accountId: "jonas", title: "Zählerstand", assigneeId: "lea" });
    await call("POST", "/", { accountId: "jonas", title: "Privat" });
    expect(changes[0]).toEqual(["jonas", ["lea"]]);
    as(lea);
    const listed = (await (await call("GET", "/")).json()) as { tasks: Task[] };
    expect(listed.tasks.map((task) => task.title)).toEqual(["Zählerstand"]);
    expect((await call("PATCH", "/t1", { status: "done" })).status).toBe(200);
    expect(tasks[0]!.status).toBe("done");
    expect((await call("PATCH", "/t1", { accountId: "info" })).status).toBe(403);
    expect((await call("PATCH", "/t2", { status: "done" })).status).toBe(404);
    expect((await call("DELETE", "/t1")).status).toBe(403);
  });
});
