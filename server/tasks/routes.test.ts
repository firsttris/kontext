// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionAccount } from "../categories/routes";
import type { Notice } from "../push/pusher";
import { readOnlyInbox, sampleSessionInfo } from "../sample-session";
import { memoryTaskStore } from "./memory-store";
import { createTaskRoutes } from "./routes";
import { isCalendarDay, type Task } from "./tasks";

const accounts: SessionAccount[] = [
  { id: "jonas", isPersonal: true, isReadOnly: false },
  { id: "info", isPersonal: false, isReadOnly: false },
];

const lea: SessionAccount[] = [
  { id: "lea", isPersonal: true, isReadOnly: false },
  { id: "info", isPersonal: false, isReadOnly: false },
];

const setup = () => {
  const { tasks, store } = memoryTaskStore();
  let signedIn = accounts;
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

  it("takes a due day only if it exists", async () => {
    const { tasks, call } = setup();
    const post = (dueDate: string) =>
      call("POST", "/", { accountId: "jonas", title: "x", dueDate });
    expect((await post("2026-04-31")).status).toBe(400);
    expect((await post("2026-13-05")).status).toBe(400);
    expect((await post("2027-02-29")).status).toBe(400);
    expect((await post("2028-02-29")).status).toBe(201);
    expect(tasks.map((task) => task.dueDate)).toEqual(["2028-02-29"]);
    expect((await call("PATCH", "/t1", { dueDate: "2028-02-30" })).status).toBe(400);
  });

  it("takes a due time only if it is one of the day", async () => {
    const { call } = setup();
    const post = (dueTime: string) =>
      call("POST", "/", { accountId: "jonas", title: "x", dueDate: "2026-10-30", dueTime });
    expect((await post("24:00")).status).toBe(400);
    expect((await post("12:60")).status).toBe(400);
    expect((await post("23:59")).status).toBe(201);
  });

  it("knows the days of any year, also 0000–0099", () => {
    expect(isCalendarDay("0050-01-01")).toBe(true);
    expect(isCalendarDay("0000-02-29")).toBe(true);
    expect(isCalendarDay("0100-02-29")).toBe(false);
    expect(isCalendarDay("2026-04-31")).toBe(false);
    expect(isCalendarDay("2026-4-1")).toBe(false);
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

describe("columns and repeating tasks", () => {
  it("keeps a board's own columns, and puts tasks of a removed one back into open", async () => {
    const { tasks, call } = setup();
    const columns = [
      { id: "open", name: "" },
      { id: "c-bestellt", name: "Bestellt" },
      { id: "done", name: "Fertig" },
    ];
    expect((await call("PUT", "/boards/info", { columns })).status).toBe(200);
    await call("POST", "/", { accountId: "info", title: "Fliesen", status: "c-bestellt" });
    expect(tasks[0]!.status).toBe("c-bestellt");
    // A column the board does not have, a board without "open" first: refused.
    expect(
      (await call("POST", "/", { accountId: "info", title: "x", status: "doing" })).status,
    ).toBe(400);
    expect(
      (
        await call("PUT", "/boards/info", {
          columns: [
            { id: "done", name: "" },
            { id: "open", name: "" },
          ],
        })
      ).status,
    ).toBe(400);
    await call("PUT", "/boards/info", { columns: [columns[0], columns[2]] });
    expect(tasks[0]!.status).toBe("open");
    const listed = (await (await call("GET", "/")).json()) as {
      boards: Record<string, { id: string }[]>;
    };
    expect(listed.boards.info!.map((c) => c.id)).toEqual(["open", "done"]);
    expect(listed.boards.jonas!.map((c) => c.id)).toEqual(["open", "doing", "waiting", "done"]);
  });

  it("keeps a project's tasks on their own board, with its own columns", async () => {
    const { tasks, call, changes, as } = setup();
    const made = await call("POST", "/projects", { accountId: "info", name: " Baustelle " });
    expect(made.status).toBe(201);
    const { project } = (await made.json()) as { project: { id: string; name: string } };
    expect(project.name).toBe("Baustelle");
    expect(changes.at(-1)).toEqual(["info", []]);
    await call("POST", "/", { accountId: "info", projectId: project.id, title: "Rohre bestellen" });
    await call("POST", "/", { accountId: "info", title: "Rückruf" });
    expect(tasks.map((task) => task.projectId)).toEqual([project.id, null]);
    // Columns per board: the project's do not touch info@'s own.
    await call("PUT", `/boards/${project.id}`, {
      columns: [
        { id: "open", name: "" },
        { id: "c-bestellt", name: "Bestellt" },
        { id: "done", name: "" },
      ],
    });
    const listed = (await (await call("GET", "/")).json()) as {
      projects: { id: string }[];
      boards: Record<string, { id: string }[]>;
    };
    expect(listed.projects.map((p) => p.id)).toEqual([project.id]);
    expect(listed.boards[project.id]!.map((c) => c.id)).toEqual(["open", "c-bestellt", "done"]);
    expect(listed.boards.info!.map((c) => c.id)).toEqual(["open", "doing", "waiting", "done"]);
    // A column only the project has is unknown on info@'s own board.
    expect((await call("PATCH", "/t2", { status: "c-bestellt" })).status).toBe(400);
    expect((await call("PATCH", "/t1", { status: "c-bestellt" })).status).toBe(200);
    // Who cannot write info@ makes no project there.
    as(lea.filter((account) => account.id !== "info"));
    expect((await call("POST", "/projects", { accountId: "info", name: "X" })).status).toBe(403);
    expect((await call("PUT", `/boards/${project.id}`, { columns: [] })).status).toBe(403);
  });

  it("moves a task between a project and its account's board, never into another's project", async () => {
    const { tasks, call } = setup();
    const { project } = (await (
      await call("POST", "/projects", { accountId: "info", name: "Baustelle" })
    ).json()) as { project: { id: string } };
    await call("POST", "/", { accountId: "jonas", title: "Angebot" });
    // A project of info@ is no board of jonas.
    expect((await call("PATCH", "/t1", { projectId: project.id })).status).toBe(400);
    expect(
      (await call("POST", "/", { accountId: "jonas", projectId: project.id, title: "X" })).status,
    ).toBe(400);
    expect((await call("PATCH", "/t1", { accountId: "info", projectId: project.id })).status).toBe(
      200,
    );
    expect(tasks[0]).toMatchObject({ accountId: "info", projectId: project.id });
    // Onto another account without a project: onto its own board.
    await call("PATCH", "/t1", { accountId: "jonas" });
    expect(tasks[0]).toMatchObject({ accountId: "jonas", projectId: null });
  });

  it("renames a project and, removed, puts its tasks on the account's board", async () => {
    const { tasks, call } = setup();
    const { project } = (await (
      await call("POST", "/projects", { accountId: "info", name: "Baustelle" })
    ).json()) as { project: { id: string } };
    await call("PUT", `/boards/${project.id}`, {
      columns: [
        { id: "open", name: "" },
        { id: "c-bestellt", name: "Bestellt" },
        { id: "doing", name: "" },
        { id: "done", name: "" },
      ],
    });
    await call("POST", "/", { accountId: "info", projectId: project.id, title: "Rohre" });
    await call("POST", "/", { accountId: "info", projectId: project.id, title: "Kessel" });
    await call("PATCH", "/t1", { status: "c-bestellt" });
    await call("PATCH", "/t2", { status: "doing" });
    expect((await call("PATCH", `/projects/${project.id}`, { name: "" })).status).toBe(400);
    await call("PATCH", `/projects/${project.id}`, { name: "Baustelle Hoffmann" });
    let listed = (await (await call("GET", "/")).json()) as { projects: { name: string }[] };
    expect(listed.projects.map((p) => p.name)).toEqual(["Baustelle Hoffmann"]);
    expect((await call("DELETE", `/projects/${project.id}`)).status).toBe(200);
    listed = (await (await call("GET", "/")).json()) as { projects: { name: string }[] };
    expect(listed.projects).toEqual([]);
    // The column info@ lacks: into "open"; the one it has: kept.
    expect(tasks.map(({ projectId, status }) => [projectId, status])).toEqual([
      [null, "open"],
      [null, "doing"],
    ]);
    expect((await call("DELETE", `/projects/${project.id}`)).status).toBe(404);
  });

  it("moved onto a board without its column, a task goes into open", async () => {
    const { tasks, call } = setup();
    await call("PUT", "/boards/info", {
      columns: [
        { id: "open", name: "" },
        { id: "done", name: "" },
      ],
    });
    await call("POST", "/", { accountId: "jonas", title: "Rohr", status: "waiting" });
    expect((await call("PATCH", "/t1", { accountId: "info" })).status).toBe(200);
    expect(tasks[0]!.status).toBe("open");
  });

  it("done, a repeating task comes again on its next day", async () => {
    const { tasks, call } = setup();
    await call("POST", "/", {
      accountId: "jonas",
      title: "Zählerstand",
      dueDate: "2020-01-31",
      repeat: "monthly",
    });
    await call("PATCH", "/t1", { status: "done" });
    expect(tasks).toHaveLength(2);
    expect(tasks[0]!.repeat).toBeNull();
    expect(tasks[1]).toMatchObject({ title: "Zählerstand", status: "open", repeat: "monthly" });
    expect(tasks[1]!.dueDate! > "2020-01-31").toBe(true);
  });
});

describe("task rights from Stalwart's session", () => {
  afterEach(() => vi.unstubAllGlobals());

  const setupWith = (people: Parameters<typeof sampleSessionInfo>[0]) => {
    const { accountsOf } = sampleSessionInfo(people);
    const { tasks, store } = memoryTaskStore();
    const app = createTaskRoutes({ store, accountsOf });
    const call = (who: string, method: string, path: string, body?: unknown) =>
      app.request(path, {
        method,
        headers: { "x-who": who, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    return { tasks, call };
  };

  it("lets who only reads info@ look at its tasks, not delete them", async () => {
    const { tasks, call } = setupWith({
      jonas: { info: { member: true } },
      max: { info: { folders: [readOnlyInbox] } },
    });
    expect((await call("jonas", "POST", "/", { accountId: "info", title: "Angebot" })).status).toBe(
      201,
    );
    const listed = (await (await call("max", "GET", "/")).json()) as { tasks: Task[] };
    expect(listed.tasks.map((task) => task.title)).toEqual(["Angebot"]);
    expect((await call("max", "DELETE", `/${tasks[0]!.id}`)).status).toBe(403);
    expect(tasks).toHaveLength(1);
  });

  it("gives no colleague's own board to who only sees her shared address book", async () => {
    const { tasks, call } = setupWith({ anna: {}, jonas: { anna: { folders: [] } } });
    await call("anna", "POST", "/", { accountId: "anna", title: "Arzttermin" });
    const listed = (await (await call("jonas", "GET", "/")).json()) as { tasks: Task[] };
    expect(listed.tasks).toEqual([]);
    expect((await call("jonas", "DELETE", `/${tasks[0]!.id}`)).status).not.toBe(200);
    expect(tasks).toHaveLength(1);
  });
});
