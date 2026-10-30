/**
 * Chat and tasks in the demo: the Kontext server's own routes (server/chat/routes.ts,
 * server/tasks/routes.ts) on stores in memory, run in the page. They are filled as on a dev
 * server, by the people themselves through these routes (dev/demo-data.ts `fillWith`).
 */
import { Hono } from "hono";
import { fillWith, type Person } from "../../dev/demo-data";
import type { SessionAccount } from "../../server/categories/routes";
import { createMemoryChat } from "../../server/chat/memory-store";
import { createChatRoutes } from "../../server/chat/routes";
import { createHub } from "../../server/live/hub";
import { memoryTaskStore } from "../../server/tasks/memory-store";
import { createTaskRoutes } from "../../server/tasks/routes";
import { type Store, visibleAccounts } from "./store";

/** The signed-in person's accounts as the server's routes read them (server/session-info.ts). */
const sessionAccounts = (store: Store): SessionAccount[] | null => {
  const accounts = visibleAccounts(store);
  return accounts.length
    ? accounts.map((account, index) => ({
        id: account.id,
        isPersonal: index === 0,
        isReadOnly: false,
      }))
    : null;
};

/** /api/chat and /api/tasks for whoever is signed in. */
export const createTeamRoutes = (store: Store) => {
  const chat = createMemoryChat();
  const accountsOf = async () => sessionAccounts(store);
  return new Hono()
    .route(
      "/api/chat",
      createChatRoutes({
        ...chat,
        hub: createHub(),
        accountsOf,
        nameOf: async () => visibleAccounts(store)[0]?.fullName ?? "",
        openFile: (path) => chat.blobs.get(path) ?? new Blob(),
      }),
    )
    .route(
      "/api/tasks",
      createTaskRoutes({ store: memoryTaskStore(Date.now()).store, accountsOf }),
    );
};

/** Whether a path is the team routes'. */
export const isTeamPath = (path: string) =>
  path.startsWith("/api/chat") || path.startsWith("/api/tasks");

type Handle = (request: Request) => Promise<Response | null>;

/**
 * Fills chat and tasks with the seed's conversation (dev/demo-data.ts): each request as the
 * person who makes it, then nobody is signed in again.
 */
export const fillTeam = async (store: Store, handle: Handle, origin: string) => {
  const as = async <T>(person: Person, path: string, init: RequestInit): Promise<T> => {
    store.user = person;
    try {
      const response = await handle(new Request(`${origin}${path}`, init));
      if (!response?.ok) throw new Error(`${person}: ${init.method} ${path}: ${response?.status}`);
      return (await response.json()) as T;
    } finally {
      store.user = null;
    }
  };
  await fillWith({
    api: (person, method, path, data) =>
      as(person, path, {
        method,
        headers: data === undefined ? {} : { "content-type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      }),
    upload: (person, path, file) => {
      const form = new FormData();
      form.append("file", file);
      return as(person, path, { method: "POST", body: form });
    },
    findMail: async (_user, mailbox, subject) => {
      const email = [...store.emails.values()].find(
        (candidate) => candidate.accountId === mailbox && candidate.subject === subject,
      );
      if (!email) throw new Error(`Keine Mail „${subject}“ in ${mailbox}`);
      return {
        accountId: mailbox,
        email: {
          id: email.id,
          threadId: email.threadId,
          from: (email.from ?? []) as { name: string; email: string }[],
        },
      };
    },
  });
};
