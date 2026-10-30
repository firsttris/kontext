// @vitest-environment node
import { describe, expect, it } from "vitest";
import { memoryTaskStore } from "../tasks/memory-store";
import type { DavUser } from "./auth";
import { createDavRoutes } from "./routes";

const jonas: DavUser = {
  me: "jonas",
  accounts: [
    { id: "jonas", name: "jonas@w.test", isReadOnly: false },
    { id: "info", name: "info@w.test", isReadOnly: false },
    { id: "chef", name: "chef@w.test", isReadOnly: true },
  ],
};

const setup = () => {
  const { tasks, store } = memoryTaskStore();
  const changed: string[] = [];
  const dav = createDavRoutes({
    auth: async (header) => (header === "Basic good" ? jonas : null),
    store,
    changed: (id) => changed.push(id),
  });
  // Mounted as in the app, so paths are as clients see them.
  const call = (
    method: string,
    path: string,
    body?: string,
    headers: Record<string, string> = {},
  ) =>
    dav.request(path.replace(/^\/dav/, ""), {
      method,
      headers: { authorization: "Basic good", ...headers },
      body,
    });
  return { tasks, store, call, changed };
};

const vtodo = (summary: string, extra: string[] = []) =>
  [
    "BEGIN:VCALENDAR",
    "BEGIN:VTODO",
    "UID:uid-1",
    `SUMMARY:${summary}`,
    ...extra,
    "END:VTODO",
    "END:VCALENDAR",
  ].join("\r\n");

describe("CalDAV", () => {
  it("asks for a sign-in", async () => {
    const { call } = setup();
    const response = await call("PROPFIND", "/dav/", undefined, { authorization: "Basic bad" });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
  });

  it("leads from the principal to one task list per board", async () => {
    const { call } = setup();
    const root = await (await call("PROPFIND", "/dav/", "", { depth: "0" })).text();
    expect(root).toContain("<C:calendar-home-set><D:href>/dav/tasks/</D:href>");
    const home = await call("PROPFIND", "/dav/tasks/", "", { depth: "1" });
    expect(home.status).toBe(207);
    const text = await home.text();
    expect(text).toContain("<D:href>/dav/tasks/info/</D:href>");
    expect(text).toContain("Meine Aufgaben (Kontext)");
    expect(text).toContain("Aufgaben info@");
    expect(text).toContain('<C:comp name="VTODO"/>');
  });

  it("gives each project its own list, and a task put there lands on the project", async () => {
    const { tasks, store, call } = setup();
    const project = await store.createProject("info", "Baustelle Hoffmann");
    await store.createProject("elsewhere", "Fremd");
    const home = await (await call("PROPFIND", "/dav/tasks/", "", { depth: "1" })).text();
    expect(home).toContain(`<D:href>/dav/tasks/${project.id}/</D:href>`);
    expect(home).toContain("Baustelle Hoffmann (info@)");
    expect(home).not.toContain("Fremd");
    const put = await call("PUT", `/dav/tasks/${project.id}/neu.ics`, vtodo("Rohre bestellen"));
    expect(put.status).toBe(201);
    expect(tasks[0]).toMatchObject({ accountId: "info", projectId: project.id });
    // Only on the project's list, not on info@'s own.
    const own = await (await call("PROPFIND", "/dav/tasks/info/", "", { depth: "1" })).text();
    expect(own).not.toContain("neu.ics");
    const listed = await (
      await call("PROPFIND", `/dav/tasks/${project.id}/`, "", { depth: "1" })
    ).text();
    expect(listed).toContain("neu.ics");
  });

  it("a task made in Kontext can be read, changed and done from a client", async () => {
    const { tasks, store, call, changed } = setup();
    await store.create(
      {
        accountId: "info",
        projectId: null,
        title: "Rückruf Hoffmann",
        notes: "",
        status: "open",
        assigneeId: null,
        dueDate: "2026-10-27",
        dueTime: null,
        checklist: [],
        links: [],
        remindAt: null,
        repeat: null,
      },
      "jonas",
    );
    const listing = await (await call("PROPFIND", "/dav/tasks/info/", "", { depth: "1" })).text();
    expect(listing).toContain("<D:href>/dav/tasks/info/t1.ics</D:href>");
    const got = await call("GET", "/dav/tasks/info/t1.ics");
    const etag = got.headers.get("etag")!;
    expect(await got.text()).toContain("SUMMARY:Rückruf Hoffmann");

    const multiget = await (
      await call(
        "REPORT",
        "/dav/tasks/info/",
        '<C:calendar-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:href>/dav/tasks/info/t1.ics</D:href><D:href>/dav/tasks/info/gone.ics</D:href></C:calendar-multiget>',
      )
    ).text();
    expect(multiget).toContain("BEGIN:VTODO");
    expect(multiget).toContain("404 Not Found");

    // An old version is refused; with the current one it is done.
    expect(
      (await call("PUT", "/dav/tasks/info/t1.ics", vtodo("x"), { "if-match": '"1"' })).status,
    ).toBe(412);
    const put = await call(
      "PUT",
      "/dav/tasks/info/t1.ics",
      vtodo("Rückruf Hoffmann", ["STATUS:COMPLETED"]),
      { "if-match": etag },
    );
    expect(put.status).toBe(204);
    expect(tasks[0]!.status).toBe("done");
    expect(changed).toEqual(["info"]);
  });

  it("a task made in a client keeps its file name; in progress is the next column", async () => {
    const { tasks, call } = setup();
    const created = await call(
      "PUT",
      "/dav/tasks/jonas/abc-123.ics",
      vtodo("Fliesen bestellen", ["STATUS:IN-PROCESS", "DUE;VALUE=DATE:20261030"]),
      { "if-none-match": "*" },
    );
    expect(created.status).toBe(201);
    expect(tasks[0]).toMatchObject({
      title: "Fliesen bestellen",
      status: "doing",
      dueDate: "2026-10-30",
      assigneeId: "jonas",
    });
    const got = await (await call("GET", "/dav/tasks/jonas/abc-123.ics")).text();
    expect(got).toContain("UID:uid-1");
    expect((await call("DELETE", "/dav/tasks/jonas/abc-123.ics")).status).toBe(204);
    expect(tasks).toHaveLength(0);
  });

  it("a file name with a percent sign is decoded once and round-trips", async () => {
    const { tasks, store, call } = setup();
    // The client's files "50%.ics" and "a%41.ics", percent-encoded in the URL (RFC 3986).
    expect((await call("PUT", "/dav/tasks/jonas/50%25.ics", vtodo("Halb"))).status).toBe(201);
    expect((await call("PUT", "/dav/tasks/jonas/a%2541.ics", vtodo("Eins"))).status).toBe(201);
    const names = (await store.davList({ accountId: "jonas", projectId: null }, new Date(0))).map(
      ({ name }) => name,
    );
    expect(names.sort()).toEqual(["50%", "a%41"]);

    // The hrefs written back are the ones the client used.
    const listing = await (await call("PROPFIND", "/dav/tasks/jonas/", "", { depth: "1" })).text();
    expect(listing).toContain("<D:href>/dav/tasks/jonas/a%2541.ics</D:href>");
    expect((await call("GET", "/dav/tasks/jonas/a%2541.ics")).status).toBe(200);
    const multiget = await (
      await call(
        "REPORT",
        "/dav/tasks/jonas/",
        '<C:calendar-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:href>/dav/tasks/jonas/a%2541.ics</D:href><D:href>/dav/tasks/jonas/50%.ics</D:href></C:calendar-multiget>',
      )
    ).text();
    expect(multiget).toContain("SUMMARY:Eins");
    // A malformed href names no task instead of failing the REPORT.
    expect(multiget).toContain("404 Not Found");
    expect((await call("DELETE", "/dav/tasks/jonas/a%2541.ics")).status).toBe(204);
    expect(tasks.map((task) => task.title)).toEqual(["Halb"]);
  });

  it("a due day that does not exist is stored as none, not as given, and is no 500", async () => {
    const { tasks, call } = setup();
    const april = await call(
      "PUT",
      "/dav/tasks/jonas/april.ics",
      vtodo("Rechnung prüfen", ["DUE;VALUE=DATE:20260431"]),
    );
    expect(april.status).toBe(201);
    expect(tasks[0]).toMatchObject({ title: "Rechnung prüfen", dueDate: null, dueTime: null });
    const month13 = await call(
      "PUT",
      "/dav/tasks/jonas/month13.ics",
      vtodo("Anruf", ["DUE;VALUE=DATE:20261305"]),
    );
    expect(month13.status).toBe(201);
    expect(tasks.find((task) => task.title === "Anruf")).toMatchObject({ dueDate: null });
  });

  it("tells a client what changed since its sync token (sync-collection)", async () => {
    const { store, call } = setup();
    const sync = (token: string, data = false) =>
      call(
        "REPORT",
        "/dav/tasks/jonas/",
        `<D:sync-collection xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:sync-token>${token}</D:sync-token><D:sync-level>1</D:sync-level><D:prop><D:getetag/>${data ? "<C:calendar-data/>" : ""}</D:prop></D:sync-collection>`,
        { depth: "0" },
      );
    const tokenOf = (text: string) => text.match(/<D:sync-token>([^<]+)<\/D:sync-token>/)![1]!;
    await call("PUT", "/dav/tasks/jonas/a.ics", vtodo("Fliesen bestellen"));
    await call("PUT", "/dav/tasks/jonas/b.ics", vtodo("Angebot schreiben"));

    // The board names its token and that it can sync.
    const listing = await (await call("PROPFIND", "/dav/tasks/jonas/", "", { depth: "0" })).text();
    expect(listing).toContain("<D:sync-collection/>");
    const first = await sync("", true);
    expect(first.status).toBe(207);
    const all = await first.text();
    expect(all).toContain("/dav/tasks/jonas/a.ics");
    expect(all).toContain("SUMMARY:Angebot schreiben");
    expect(tokenOf(all)).toBe(tokenOf(listing));

    // Nothing changed: nothing listed, the same token.
    const quiet = await (await sync(tokenOf(all))).text();
    expect(quiet).not.toContain("<D:response>");
    expect(tokenOf(quiet)).toBe(tokenOf(all));

    // One changed, one deleted, one new: exactly these, the deleted one as 404.
    await call("PUT", "/dav/tasks/jonas/a.ics", vtodo("Fliesen bestellt", ["STATUS:COMPLETED"]));
    await store.create(
      {
        accountId: "jonas",
        projectId: null,
        title: "Neu in Kontext",
        notes: "",
        status: "open",
        assigneeId: null,
        dueDate: null,
        dueTime: null,
        checklist: [],
        links: [],
        remindAt: null,
        repeat: null,
      },
      "jonas",
    );
    await call("DELETE", "/dav/tasks/jonas/b.ics");
    const delta = await (await sync(tokenOf(all))).text();
    const hrefs = [...delta.matchAll(/<D:href>([^<]+)<\/D:href>/g)].map((match) => match[1]);
    const made = (await store.davList({ accountId: "jonas", projectId: null }, new Date(0))).find(
      ({ task }) => task.title === "Neu in Kontext",
    )!;
    expect(hrefs.sort()).toEqual([
      "/dav/tasks/jonas/a.ics",
      "/dav/tasks/jonas/b.ics",
      `/dav/tasks/jonas/${made.name}.ics`,
    ]);
    expect(delta).toMatch(/b\.ics<\/D:href><D:status>HTTP\/1\.1 404/);
    expect(delta).not.toContain("BEGIN:VTODO");
    expect(tokenOf(delta)).not.toBe(tokenOf(all));

    // A token it does not know (another server's, or forgotten after a restart): start anew.
    const unknown = await sync("urn:kontext:sync:0000");
    expect(unknown.status).toBe(403);
    expect(await unknown.text()).toContain("<D:valid-sync-token/>");
  });

  it("a board one may only read stays as it is", async () => {
    const { call } = setup();
    expect((await call("PUT", "/dav/tasks/chef/x.ics", vtodo("Nein"))).status).toBe(403);
    expect((await call("PUT", "/dav/tasks/fremd/x.ics", vtodo("Nein"))).status).toBe(404);
  });
});
