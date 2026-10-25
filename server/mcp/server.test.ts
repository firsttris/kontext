// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Reader } from "./reader";
import { handleMcp } from "./server";

const reader = {
  accounts: async () => [{ id: "a1", name: "jonas@weber-haustechnik.test", personal: true }],
  readMail: async () => {
    throw new Error("Mail nicht gefunden: m9");
  },
} as unknown as Reader;

const rpc = async (method: string, params: Record<string, unknown> = {}) => {
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
    reader,
    "0.1.0",
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { result: Record<string, unknown> };
};

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

  it("offers read-only tools", async () => {
    const { result } = await rpc("tools/list");
    const tools = result.tools as { name: string; annotations: { readOnlyHint: boolean } }[];
    expect(tools.map((tool) => tool.name)).toEqual([
      "list_accounts",
      "search_contacts",
      "customer_overview",
      "search_mail",
      "get_mail",
      "get_thread",
      "list_events",
      "list_tasks",
    ]);
    expect(tools.every((tool) => tool.annotations.readOnlyHint)).toBe(true);
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
});
