/**
 * /dav: the task boards as CalDAV task lists (RFC 4791, VTODO only), for Thunderbird, DAVx⁵ with
 * tasks.org or jtx Board, Apple Erinnerungen. One list per board the person has (own mailbox,
 * info@ …); reading, writing and deleting as in Kontext, read-only boards only to read. Clients
 * find their way from /.well-known/caldav; changes reach Kontext's open views live.
 *
 * Paths: /dav/ → /dav/principals/me/ → /dav/tasks/ (home) → /dav/tasks/<board>/<name>.ics
 *
 * Clients learn of changes by the ctag and, quicker, by `sync-collection` (sync.ts).
 */
import { Hono } from "hono";
import type { TaskStore } from "../tasks/store";
import {
  type BoardColumn,
  companyDay,
  DEFAULT_COLUMNS,
  nextOccurrence,
  type Task,
  type TaskPatch,
} from "../tasks/tasks";
import type { DavAccount, DavUser } from "./auth";
import { type IncomingTodo, readVtodo, toVtodo } from "./ical";
import {
  changesSince,
  createSnapshots,
  ctagOf,
  type Snapshot,
  type Snapshots,
  syncToken,
  tokenIn,
  wantsData,
} from "./sync";
import { davError, hrefsOf, multistatus, notFound, reportKind, response, xmlText } from "./xml";

const ROOT = "/dav/";
const PRINCIPAL = "/dav/principals/me/";
const HOME = "/dav/tasks/";
/** Finished tasks stay in the lists this long, as in Kontext. */
const DONE_DAYS = 30;
const ICS = "text/calendar; charset=utf-8";
const REPORTS = ["<C:calendar-multiget/>", "<C:calendar-query/>", "<D:sync-collection/>"];

export type DavDeps = {
  /** The Authorization header and the caller's address. */
  auth: (header: string | undefined, client: string) => Promise<DavUser | null>;
  store: TaskStore;
  /** Told after a change, with the board it touched. */
  changed?: (accountId: string) => void;
  now?: () => Date;
  /** The tokens handed out for sync-collection; one set per server. */
  snapshots?: Snapshots;
};

const boardHref = (accountId: string) => `${HOME}${encodeURIComponent(accountId)}/`;
const taskHref = (accountId: string, name: string) =>
  `${boardHref(accountId)}${encodeURIComponent(name)}.ics`;
const etag = (task: Task) => `"${Date.parse(task.updatedAt)}"`;

/** "abc.ics" → "abc"; the name as stored, the inverse of `taskHref`. */
const taskName = (file: string) => file.replace(/\.ics$/, "");

/**
 * The task's name from a multiget href: hrefs in the body are URIs (RFC 4918 §8.3), so their last
 * segment is percent-decoded once here, unlike path params, which Hono has decoded already.
 * A malformed one ("50%.ics") names no task rather than failing the whole REPORT.
 */
const nameOfHref = (href: string) => {
  try {
    return taskName(decodeURIComponent(href.split("/").pop() ?? ""));
  } catch {
    return "";
  }
};

/** "info@weber-haustechnik.test" → "Aufgaben info@", the own one "Meine Aufgaben". */
const boardName = (account: DavAccount, me: string) =>
  account.id === me ? "Meine Aufgaben (Kontext)" : `Aufgaben ${account.name.replace(/@.*/, "@")}`;

/** What a client's state means on this board: in progress is the first column after "open". */
const statusFor = (
  state: IncomingTodo["state"],
  current: string | null,
  columns: BoardColumn[],
) => {
  if (state === "done") return "done";
  if (state === "open") return current && current !== "done" ? current : "open";
  if (current && current !== "open" && current !== "done") return current;
  return columns.find((column) => column.id !== "open" && column.id !== "done")?.id ?? "open";
};

export const createDavRoutes = ({
  auth,
  store,
  changed = () => undefined,
  now = () => new Date(),
  snapshots = createSnapshots(),
}: DavDeps) => {
  const app = new Hono<{ Variables: { user: DavUser } }>();

  app.use(async (c, next) => {
    const client = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const user = await auth(c.req.header("authorization"), client);
    if (!user) {
      return c.text("Anmeldung nötig", 401, { "www-authenticate": 'Basic realm="Kontext"' });
    }
    c.set("user", user);
    await next();
    c.header("dav", "1, 3, calendar-access");
  });

  const boardOf = (user: DavUser, id: string) => user.accounts.find((a) => a.id === id);
  const since = () => new Date(now().getTime() - DONE_DAYS * 86_400_000);

  /** The tasks of a board, its ctag, and – remembered for the sync token – their ETags. */
  const stateOf = async (accountId: string) => {
    const list = await store.davList(accountId, since());
    const text = list
      .map(({ task }) => `${task.id}:${task.updatedAt}`)
      .sort()
      .join(",");
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
    const ctag = Buffer.from(digest).toString("hex");
    const snapshot: Snapshot = new Map(list.map(({ name, task }) => [name, etag(task)]));
    snapshots.remember(accountId, ctag, snapshot);
    return { list, ctag, snapshot };
  };

  const principalProps = [
    `<D:current-user-principal><D:href>${PRINCIPAL}</D:href></D:current-user-principal>`,
    `<D:principal-URL><D:href>${PRINCIPAL}</D:href></D:principal-URL>`,
    `<C:calendar-home-set><D:href>${HOME}</D:href></C:calendar-home-set>`,
  ];

  const boardResponse = async (user: DavUser, account: DavAccount) => {
    const { ctag } = await stateOf(account.id);
    return response(boardHref(account.id), [
      "<D:resourcetype><D:collection/><C:calendar/></D:resourcetype>",
      `<D:displayname>${xmlText(boardName(account, user.me))}</D:displayname>`,
      '<C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set>',
      `<CS:getctag>${ctag}</CS:getctag>`,
      `<D:sync-token>${xmlText(syncToken(ctag))}</D:sync-token>`,
      `<D:supported-report-set>${REPORTS.map(
        (report) => `<D:supported-report><D:report>${report}</D:report></D:supported-report>`,
      ).join("")}</D:supported-report-set>`,
      `<D:current-user-principal><D:href>${PRINCIPAL}</D:href></D:current-user-principal>`,
      `<D:current-user-privilege-set><D:privilege><D:read/></D:privilege>${
        account.isReadOnly
          ? ""
          : "<D:privilege><D:write/></D:privilege><D:privilege><D:write-content/></D:privilege><D:privilege><D:bind/></D:privilege><D:privilege><D:unbind/></D:privilege>"
      }</D:current-user-privilege-set>`,
    ]);
  };

  const taskResponse = (accountId: string, name: string, uid: string, task: Task, data: boolean) =>
    response(taskHref(accountId, name), [
      "<D:resourcetype/>",
      `<D:getetag>${xmlText(etag(task))}</D:getetag>`,
      `<D:getcontenttype>${ICS}</D:getcontenttype>`,
      ...(data ? [`<C:calendar-data>${xmlText(toVtodo(task, uid))}</C:calendar-data>`] : []),
    ]);

  app.on("OPTIONS", "*", (c) =>
    c.body(null, 200, {
      allow: "OPTIONS, GET, PUT, DELETE, PROPFIND, REPORT",
      dav: "1, 3, calendar-access",
    }),
  );

  app.on("PROPFIND", ["/", "", "/principals/me/", "/principals/me"], (c) =>
    multistatus([
      response(c.req.path.startsWith("/dav/principals") ? PRINCIPAL : ROOT, [
        c.req.path.startsWith("/dav/principals")
          ? "<D:resourcetype><D:principal/></D:resourcetype>"
          : "<D:resourcetype><D:collection/></D:resourcetype>",
        ...principalProps,
      ]),
    ]),
  );

  app.on("PROPFIND", ["/tasks/", "/tasks"], async (c) => {
    const user = c.get("user");
    const home = response(HOME, [
      "<D:resourcetype><D:collection/></D:resourcetype>",
      ...principalProps,
    ]);
    if (c.req.header("depth") === "0") return multistatus([home]);
    return multistatus([
      home,
      ...(await Promise.all(user.accounts.map((account) => boardResponse(user, account)))),
    ]);
  });

  app.on("PROPFIND", ["/tasks/:board/", "/tasks/:board"], async (c) => {
    const user = c.get("user");
    const account = boardOf(user, c.req.param("board"));
    if (!account) return c.text("Unbekannt", 404);
    const own = await boardResponse(user, account);
    if (c.req.header("depth") === "0") return multistatus([own]);
    const list = await store.davList(account.id, since());
    return multistatus([
      own,
      ...list.map(({ task, name, uid }) => taskResponse(account.id, name, uid, task, false)),
    ]);
  });

  app.on("REPORT", ["/tasks/:board/", "/tasks/:board"], async (c) => {
    const user = c.get("user");
    const account = boardOf(user, c.req.param("board"));
    if (!account) return c.text("Unbekannt", 404);
    const body = await c.req.text();
    const kind = reportKind(body);
    if (kind === "calendar-multiget") {
      const wanted = hrefsOf(body);
      return multistatus(
        await Promise.all(
          wanted.map(async (href) => {
            const name = nameOfHref(href);
            const found = name ? await store.davGet(account.id, name) : null;
            return found
              ? taskResponse(account.id, found.name, found.uid, found.task, true)
              : notFound(href);
          }),
        ),
      );
    }
    if (kind === "calendar-query") {
      const list = await store.davList(account.id, since());
      return multistatus(
        list.map(({ task, name, uid }) => taskResponse(account.id, name, uid, task, true)),
      );
    }
    if (kind === "sync-collection") return syncCollection(account.id, body);
    return davError("<D:supported-report/>", 403);
  });

  /**
   * RFC 6578: what changed since the client's token – everything for the first sync (no token),
   * a 404 for each task gone – and the new token. An unknown token makes the client start anew.
   */
  const syncCollection = async (accountId: string, body: string) => {
    const token = tokenIn(body);
    const ctag = token ? ctagOf(token) : null;
    const before = token ? ctag && snapshots.recall(accountId, ctag) : new Map<string, string>();
    if (!before) return davError("<D:valid-sync-token/>", 403);
    const now = await stateOf(accountId);
    const { changed, removed } = changesSince(before, now.snapshot);
    const byName = new Map(now.list.map((entry) => [entry.name, entry]));
    const data = wantsData(body);
    return multistatus(
      [
        ...changed.map((name) => {
          const { uid, task } = byName.get(name)!;
          return taskResponse(accountId, name, uid, task, data);
        }),
        ...removed.map((name) => notFound(taskHref(accountId, name))),
      ],
      syncToken(now.ctag),
    );
  };

  /**
   * The board and the task's file name from a path, if the person has that board. `file` comes
   * from `c.req.param`, which Hono has percent-decoded already; decoding again would turn the
   * file "a%41.ics" into "aA" and throw on "50%.ics".
   */
  const located = (user: DavUser, board: string, file: string) => {
    const account = boardOf(user, board);
    const name = taskName(file);
    return account && name ? { account, name } : null;
  };

  app.get("/tasks/:board/:file", async (c) => {
    const at = located(c.get("user"), c.req.param("board"), c.req.param("file"));
    const found = at && (await store.davGet(at.account.id, at.name));
    if (!found) return c.text("Unbekannt", 404);
    return c.body(toVtodo(found.task, found.uid), 200, {
      "content-type": ICS,
      etag: etag(found.task),
    });
  });

  app.put("/tasks/:board/:file", async (c) => {
    const user = c.get("user");
    const at = located(user, c.req.param("board"), c.req.param("file"));
    if (!at) return c.text("Unbekannt", 404);
    if (at.account.isReadOnly) return c.text("Nur zum Lesen", 403);
    const todo = readVtodo(await c.req.text());
    if (!todo) return c.text("Nur Aufgaben (VTODO)", 415);
    const found = await store.davGet(at.account.id, at.name);
    const ifMatch = c.req.header("if-match");
    if (found && c.req.header("if-none-match") === "*") return c.text("Gibt es schon", 412);
    if (found && ifMatch && ifMatch !== etag(found.task)) return c.text("Inzwischen geändert", 412);
    if (!found && ifMatch) return c.text("Unbekannt", 412);
    const columns = (await store.columns([at.account.id]))[at.account.id] ?? DEFAULT_COLUMNS;
    const fields = {
      title: todo.title,
      notes: todo.notes,
      dueDate: todo.dueDate,
      dueTime: todo.dueTime,
      remindAt: todo.remindAt,
      repeat: todo.repeat,
    };
    if (!found) {
      const task = await store.davCreate(
        {
          ...fields,
          accountId: at.account.id,
          status: statusFor(todo.state, null, columns),
          assigneeId: at.account.id === user.me ? user.me : null,
          checklist: [],
          links: [],
        },
        user.me,
        at.name,
        todo.uid || at.name,
      );
      changed(at.account.id);
      return c.body(null, 201, { etag: etag(task) });
    }
    const patch: TaskPatch = {
      ...fields,
      status: statusFor(todo.state, found.task.status, columns),
    };
    let task = await store.update(found.task.id, patch, user.me);
    // Done in the client, a repeating task comes again here as in Kontext.
    if (task && task.status === "done" && found.task.status !== "done" && task.repeat) {
      const next = nextOccurrence(task, companyDay(now()));
      if (next) await store.create(next, task.createdBy);
      task = await store.update(task.id, { repeat: null }, user.me);
    }
    changed(at.account.id);
    return c.body(null, 204, { etag: etag(task!) });
  });

  app.delete("/tasks/:board/:file", async (c) => {
    const at = located(c.get("user"), c.req.param("board"), c.req.param("file"));
    if (!at) return c.text("Unbekannt", 404);
    if (at.account.isReadOnly) return c.text("Nur zum Lesen", 403);
    const found = await store.davGet(at.account.id, at.name);
    if (!found) return c.text("Unbekannt", 404);
    await store.remove(found.task.id);
    changed(at.account.id);
    return c.body(null, 204);
  });

  return app;
};
