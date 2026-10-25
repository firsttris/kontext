// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { SessionAccount } from "../categories/routes";
import type { Notice } from "../push/pusher";
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
