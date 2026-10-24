// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { SessionAccount } from "../categories/routes";
import { createSnippetRoutes } from "./routes";
import { fillSnippet, type Snippet } from "./snippets";
import type { SnippetStore } from "./store";

const memoryStore = (): SnippetStore => {
  const snippets: Snippet[] = [];
  return {
    list: async (ids) => snippets.filter((s) => ids.includes(s.accountId)),
    get: async (id) => snippets.find((s) => s.id === id) ?? null,
    create: async (input, by) => {
      const snippet = { ...input, id: `s${snippets.length + 1}`, createdBy: by, updatedAt: "" };
      snippets.push(snippet);
      return snippet;
    },
    update: async (id, patch) => {
      const snippet = snippets.find((s) => s.id === id);
      if (snippet) Object.assign(snippet, patch);
      return snippet ?? null;
    },
    remove: async (id) => {
      snippets.splice(
        snippets.findIndex((s) => s.id === id),
        1,
      );
    },
  };
};

const jonas: SessionAccount[] = [
  { id: "jonas", isPersonal: true, isReadOnly: false },
  { id: "info", isPersonal: false, isReadOnly: false },
];
const max: SessionAccount[] = [
  { id: "max", isPersonal: true, isReadOnly: false },
  { id: "info", isPersonal: false, isReadOnly: true },
];

describe("/api/snippets", () => {
  it("shares a mailbox's snippets with who can open it; only writers change them", async () => {
    let who = jonas;
    const app = createSnippetRoutes({ store: memoryStore(), accountsOf: async () => who });
    const send = (method: string, path: string, body?: unknown) =>
      app.request(path, {
        method,
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
    const made = await send("POST", "/", {
      accountId: "info",
      title: "Termin",
      body: "Guten Tag {Name},",
    });
    expect(made.status).toBe(201);
    const { snippet } = (await made.json()) as { snippet: Snippet };
    expect(snippet.createdBy).toBe("jonas");

    who = max;
    const seen = (await (await send("GET", "/")).json()) as { snippets: Snippet[] };
    expect(seen.snippets.map((s) => s.title)).toEqual(["Termin"]);
    expect((await send("PATCH", `/${snippet.id}`, { title: "Anders" })).status).toBe(404);
    expect((await send("POST", "/", { accountId: "info", title: "x", body: "y" })).status).toBe(
      403,
    );
    expect((await send("DELETE", `/${snippet.id}`)).status).toBe(404);

    who = jonas;
    expect((await send("DELETE", `/${snippet.id}`)).status).toBe(200);
  });
});

describe("fillSnippet", () => {
  it("puts in the recipient's name, or nothing", () => {
    expect(fillSnippet("Hallo {Vorname}, Herr {Name}", { name: "Markus Hoffmann" })).toBe(
      "Hallo Markus, Herr Markus Hoffmann",
    );
    expect(fillSnippet("Guten Tag {Name},", undefined)).toBe("Guten Tag ,");
  });
});
