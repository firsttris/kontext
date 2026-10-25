// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../env";
import { createRuleTasks, type MarkedMail, taskOfMail } from "./from-rules";
import type { NewTaskData } from "./tasks";

const env = { STALWART_URL: "http://stalwart" } as Env;
const mail: MarkedMail = {
  id: "m1",
  threadId: "t1",
  subject: "AW: Angebot Bad",
  from: [{ name: "Markus Hoffmann", email: "m@h.test" }],
  receivedAt: "2026-10-25T08:00:00Z",
};

/** Stalwart: Jonas sees his mailbox and info@, Anna only info@; one marked mail in each. */
const stalwart = () => {
  const cleared: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const token = String(headers.authorization).slice(7);
      if (url.endsWith("/jmap/session")) {
        const accounts = {
          jonas: { accountCapabilities: { "urn:ietf:params:jmap:mail": {} } },
          info: { accountCapabilities: { "urn:ietf:params:jmap:mail": {} } },
        };
        return Response.json({
          apiUrl: "https://public/jmap/",
          primaryAccounts: { "urn:ietf:params:jmap:mail": token },
          accounts: token === "jonas" ? accounts : { info: accounts.info },
        });
      }
      const { methodCalls } = JSON.parse(String(init?.body)) as {
        methodCalls: [string, Record<string, unknown>, string][];
      };
      return Response.json({
        methodResponses: methodCalls.map(([name, args, id]) => {
          const account = String(args.accountId);
          if (name === "Email/query") return [name, { ids: [`${account}-m`] }, id];
          if (name === "Email/get") {
            return cleared.includes(account)
              ? [name, { list: [] }, id]
              : [name, { list: [{ ...mail, id: `${account}-m` }] }, id];
          }
          cleared.push(account);
          return [name, { updated: { [`${account}-m`]: null } }, id];
        }),
      });
    }),
  );
  return cleared;
};

afterEach(() => vi.unstubAllGlobals());

describe("tasks from rules", () => {
  it("a task of the mail: its subject, linked, one's own for the owner", () => {
    const own = taskOfMail(mail, "jonas", true);
    expect(own).toMatchObject({ accountId: "jonas", title: "Angebot Bad", assigneeId: "jonas" });
    expect(own.links[0]).toMatchObject({ kind: "mail", ref: "m1", threadId: "t1" });
    expect(own.links[0]!.detail).toMatch(/^Markus Hoffmann · /);
    expect(taskOfMail(mail, "info", false).assigneeId).toBeNull();
  });

  it("each mailbox once, the mark taken away before the task is made", async () => {
    const cleared = stalwart();
    const made: NewTaskData[] = [];
    const changed: string[] = [];
    const ruleTasks = createRuleTasks({
      env,
      grants: { accessToken: async (session) => session },
      sessions: async () => ["jonas", "anna"],
      store: {
        create: async (task) => {
          made.push(task);
          return task as never;
        },
      },
      changed: (accountId) => changed.push(accountId),
    });
    expect(await ruleTasks.tick()).toBe(2);
    expect(made.map((task) => [task.accountId, task.assigneeId])).toEqual([
      ["jonas", "jonas"],
      ["info", null],
    ]);
    expect(cleared).toEqual(["jonas", "info"]);
    expect(changed).toEqual(["jonas", "info"]);
    // Next minute: the marks are gone, nothing more.
    expect(await ruleTasks.tick()).toBe(0);
  });
});
