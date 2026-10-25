// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Scope } from "./connections";
import type { Reader } from "./reader";
import { handleMcp, type WriteGuard } from "./server";
import type { Writer } from "./writer";

const reader = {
  accounts: async () => [{ id: "a1", name: "jonas@weber-haustechnik.test", personal: true }],
  readMail: async () => {
    throw new Error("Mail nicht gefunden: m9");
  },
} as unknown as Reader;

const writer = {
  createTask: async () => ({ message: "Aufgabe „Rückruf“ angelegt.", taskId: "t1" }),
} as unknown as Writer;

const rpc = async (
  method: string,
  params: Record<string, unknown> = {},
  scopes: Scope[] = ["read"],
  guard: WriteGuard = { mayWrite: async () => true, log: async () => undefined },
) => {
  const response = await handleMcp(
    new Request("http://kontext.test/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
    { context: { reader, writer }, scopes, guard, version: "0.1.0" },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { result: Record<string, unknown> };
};

type Listed = { name: string; annotations: { readOnlyHint: boolean } };

describe("the MCP endpoint", () => {
  it("introduces itself with instructions", async () => {
    const { result } = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(result.serverInfo).toMatchObject({ name: "kontext", version: "0.1.0" });
    expect(result.instructions).toContain("customer_overview");
  });

  it("offers only read tools to a connection that may only read", async () => {
    const tools = (await rpc("tools/list")).result.tools as Listed[];
    expect(tools.map((tool) => tool.name)).toEqual([
      "list_accounts",
      "search_contacts",
      "customer_overview",
      "search_mail",
      "get_mail",
      "get_thread",
      "list_events",
      "list_colleagues",
      "list_tasks",
    ]);
    expect(tools.every((tool) => tool.annotations.readOnlyHint)).toBe(true);
  });

  it("adds the write tools with the right to write – none sends or deletes", async () => {
    const tools = (await rpc("tools/list", {}, ["read", "write"])).result.tools as Listed[];
    const writes = tools.filter((tool) => !tool.annotations.readOnlyHint).map((t) => t.name);
    expect(writes).toEqual([
      "create_draft",
      "create_event",
      "create_contact",
      "update_contact",
      "create_task",
      "update_task",
    ]);
    expect(tools.some((tool) => /send|delete/.test(tool.name))).toBe(false);
  });

  it("answers a tool call as JSON text", async () => {
    const { result } = await rpc("tools/call", { name: "list_accounts", arguments: {} });
    const [content] = result.content as { type: string; text: string }[];
    expect(JSON.parse(content!.text)).toEqual([
      { id: "a1", name: "jonas@weber-haustechnik.test", personal: true },
    ]);
  });

  it("tells the agent what went wrong instead of failing the request", async () => {
    const { result } = await rpc("tools/call", {
      name: "get_mail",
      arguments: { accountId: "a1", emailId: "m9" },
    });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: "text", text: "Mail nicht gefunden: m9" }]);
  });

  it("logs a write, and refuses one too many", async () => {
    const log = vi.fn(async () => undefined);
    const call = { name: "create_task", arguments: { title: "Rückruf" } };
    const done = await rpc("tools/call", call, ["read", "write"], {
      mayWrite: async () => true,
      log,
    });
    expect(done.result.isError).toBeUndefined();
    expect(log).toHaveBeenCalledWith("create_task", "Aufgabe „Rückruf“ angelegt.");

    const refused = await rpc("tools/call", call, ["read", "write"], {
      mayWrite: async () => false,
      log,
    });
    expect(refused.result.isError).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("does not run a write tool for a connection that may only read", async () => {
    const { result } = await rpc("tools/call", { name: "create_task", arguments: { title: "x" } });
    expect(result.isError).toBe(true);
  });
});
