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

  it("a task made in Kontext can be read, changed and done from a client", async () => {
    const { tasks, store, call, changed } = setup();
    await store.create(
      {
        accountId: "info",
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
    const names = (await store.davList("jonas", new Date(0))).map(({ name }) => name);
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

  it("a board one may only read stays as it is", async () => {
    const { call } = setup();
    expect((await call("PUT", "/dav/tasks/chef/x.ics", vtodo("Nein"))).status).toBe(403);
    expect((await call("PUT", "/dav/tasks/fremd/x.ics", vtodo("Nein"))).status).toBe(404);
  });
});
