import { describe, expect, it } from "vitest";
import type { Category } from "./categories";
import { createCategoryRoutes, type SessionAccount } from "./routes";

const setup = (accounts: SessionAccount[] | null) => {
  const saved: Record<string, Category[]> = {};
  const app = createCategoryRoutes({
    store: {
      list: async (ids) => Object.fromEntries(ids.map((id) => [id, saved[id] ?? []])),
      save: async (id, categories) => {
        saved[id] = categories;
      },
    },
    accountsOf: async () => accounts,
  });
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { send, saved };
};

const categories = [{ keyword: "angebot", name: "Angebot", color: "violet" }];

describe("/api/categories", () => {
  it("lists the categories of the person's accounts only", async () => {
    const { send } = setup([{ id: "own", isReadOnly: false }]);
    expect(await (await send("GET", "/")).json()).toEqual({ own: [] });
    expect((await setup(null).send("GET", "/")).status).toBe(401);
  });

  it("changes them only in an account the person may write to", async () => {
    const { send, saved } = setup([
      { id: "own", isReadOnly: false },
      { id: "info", isReadOnly: true },
    ]);
    expect((await send("PUT", "/own", { categories })).status).toBe(200);
    expect(saved.own).toEqual(categories);
    expect((await send("PUT", "/info", { categories })).status).toBe(403);
    expect((await send("PUT", "/fremd", { categories })).status).toBe(404);
    expect((await send("PUT", "/own", { categories: [{ keyword: "x" }] })).status).toBe(400);
  });
});
