// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../env";
import { backNotice, createSnoozeWaker } from "./waker";

const env = { STALWART_URL: "http://stalwart" } as Env;
const due = { accountId: "info", emailId: "m1", until: "", by: "jonas", userId: "u-jonas" };

/** Stalwart: sessions by token, each seeing some accounts; mails always in the snoozed folder. */
const stalwart = (accountsOf: Record<string, Record<string, { isReadOnly: boolean }>>) => {
  const used: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const token = String(
        (init?.headers as Record<string, string> | undefined)?.authorization,
      ).slice(7);
      if (url.endsWith("/jmap/session")) {
        return Response.json({ apiUrl: "https://public/jmap/", accounts: accountsOf[token] });
      }
      used.push(token);
      const { methodCalls } = JSON.parse(String(init?.body)) as {
        methodCalls: [string, Record<string, unknown>, string][];
      };
      return Response.json({
        methodResponses: methodCalls.map(([name, args, id]) => {
          if (name === "Mailbox/query") {
            return [name, { ids: [(args.filter as { role: string }).role] }, id];
          }
          if (name === "Email/get") {
            return [
              name,
              { list: [{ mailboxIds: { snoozed: true }, subject: "Angebot", from: [] }] },
              id,
            ];
          }
          return [name, { updated: { m1: null } }, id];
        }),
      });
    }),
  );
  return used;
};

afterEach(() => vi.unstubAllGlobals());

describe("createSnoozeWaker", () => {
  it("acts as a colleague when the one who put it away cannot, and tells them", async () => {
    // Jonas's session has no token any more; Max may write in info@.
    const used = stalwart({ max: { info: { isReadOnly: false } } });
    const removed: string[] = [];
    const notify = vi.fn(async () => undefined);
    const waker = createSnoozeWaker({
      env,
      grants: { accessToken: async (sessionId) => (sessionId === "s-max" ? "max" : null) },
      store: {
        due: async () => [due],
        remove: async (_accountId, ids) => void removed.push(...ids),
        sessionsFor: async () => ["s-jonas", "s-max"],
      },
      notify,
    });
    await waker.tick();
    expect(used.length).toBeGreaterThan(0);
    expect(new Set(used)).toEqual(new Set(["max"]));
    expect(removed).toEqual(["m1"]);
    expect(notify).toHaveBeenCalledWith(
      ["jonas"],
      backNotice(due, { subject: "Angebot", from: [] }),
    );
  });

  it("keeps it due when nobody may write in the mailbox", async () => {
    stalwart({ max: { info: { isReadOnly: true } } });
    const removed: string[] = [];
    const waker = createSnoozeWaker({
      env,
      grants: { accessToken: async () => "max" },
      store: {
        due: async () => [due],
        remove: async (_accountId, ids) => void removed.push(...ids),
        sessionsFor: async () => ["s-max"],
      },
      notify: async () => undefined,
    });
    await waker.tick();
    expect(removed).toEqual([]);
  });
});
