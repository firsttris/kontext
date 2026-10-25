// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { MailboxFolders } from "./mailboxes";
import { createDocumentsRoutes, type DocumentsDeps } from "./routes";
import type { Person, Schreibzeug } from "./schreibzeug";

const jonas: Person = { id: "u1", email: "jonas@weber.test", name: "Jonas Weber" };

/** Schreibzeug and Stalwart in memory, with what they were asked to do. */
const fakes = () => {
  const stored: { person: Person; folderId: string | null; name: string; text: string }[] = [];
  const uploaded: { token: string; accountId: string; text: string; type: string }[] = [];
  const shared: { owner: string; nodeId: string; email: string; role: string }[] = [];
  const schreibzeug: Schreibzeug = {
    list: async (_person, folderId) => ({
      folder: null,
      path: [],
      children: folderId ? [] : [{ id: "f1", kind: "folder", name: "Angebote" }],
    }),
    upload: async (person, folderId, file) => {
      if (stored.some((entry) => entry.name === file.name))
        throw new Error("In diesem Ordner gibt es schon etwas mit diesem Namen.");
      stored.push({ person, folderId, name: file.name, text: await file.text() });
      return { id: "n1", kind: "file", name: file.name };
    },
    download: async () => new File(["Angebot"], "Angebot.docx", { type: "application/x-docx" }),
    share: async (person, nodeId, email, role) => {
      const owner = nodeId === "info-file" ? "mailbox:m1" : "u1";
      if (nodeId === "foreign" || person.id !== owner)
        throw new Error("Das darf nur, wem es gehört.");
      shared.push({ owner: person.id, nodeId, email, role });
    },
    createFolder: async () => ({ id: "f2", kind: "folder", name: "Neu" }),
    shares: async (person, nodeId) => {
      const owner = nodeId === "info-file" ? "mailbox:m1" : "u1";
      if (nodeId === "foreign" || person.id !== owner)
        throw new Error("Das darf nur, wem es gehört.");
      return nodeId === "n2"
        ? [{ userId: "u2", email: "anna@weber.test", role: "edit" as const }]
        : [];
    },
    unshare: async () => undefined,
    endSessions: async () => undefined,
    reachable: async () => true,
  };
  const deps: DocumentsDeps = {
    url: "https://dokumente.weber.test",
    schreibzeug,
    askerOf: async (request) =>
      request.headers.get("cookie") === "session" ? { person: jonas, stalwartToken: "st" } : null,
    mailboxes: null,
    blobs: {
      download: async (_token, _accountId, blobId) => new Blob([`bytes of ${blobId}`]),
      upload: async (token, accountId, file) => {
        uploaded.push({ token, accountId, text: await file.text(), type: file.type });
        return "B1";
      },
    },
  };
  return { deps, stored, uploaded, shared };
};

const post = (path: string, body: unknown, cookie = "session") =>
  new Request(`http://kontext.test${path}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("/api/documents", () => {
  it("tells the app whether there is Schreibzeug, without a session", async () => {
    const app = createDocumentsRoutes(fakes().deps);
    expect(await (await app.request("/")).json()).toEqual({
      url: "https://dokumente.weber.test",
      connected: true,
    });
    const off = createDocumentsRoutes({ ...fakes().deps, url: null, schreibzeug: null });
    expect(await (await off.request("/")).json()).toEqual({ url: null, connected: false });
    expect((await off.request(post("/save", {}))).status).toBe(404);
  });

  it("needs a session for everything else", async () => {
    const app = createDocumentsRoutes(fakes().deps);
    expect((await app.request("/folders")).status).toBe(401);
    expect((await app.request(post("/save", {}, "none"))).status).toBe(401);
  });

  it("lists folders for the one who asks", async () => {
    const app = createDocumentsRoutes(fakes().deps);
    const reply = await app.request("/folders", { headers: { cookie: "session" } });
    expect(await reply.json()).toMatchObject({ children: [{ name: "Angebote" }] });
  });

  it("puts an attachment into a folder as the person", async () => {
    const { deps, stored } = fakes();
    const app = createDocumentsRoutes(deps);
    const body = { accountId: "a1", blobId: "b7", name: "Angebot.pdf", folderId: "f1" };
    const reply = await app.request(post("/save", body));
    expect(reply.status).toBe(201);
    expect(stored).toEqual([
      { person: jonas, folderId: "f1", name: "Angebot.pdf", text: "bytes of b7" },
    ]);
    // A taken name comes back with Schreibzeug's words.
    const again = await app.request(post("/save", body));
    expect(again.status).toBe(502);
    expect(await again.json()).toEqual({
      error: "In diesem Ordner gibt es schon etwas mit diesem Namen.",
    });
  });

  it("attaches a document as a blob of the mail's account", async () => {
    const { deps, uploaded } = fakes();
    const app = createDocumentsRoutes(deps);
    const reply = await app.request(post("/attach", { accountId: "a1", fileId: "n1" }));
    expect(await reply.json()).toEqual({
      blobId: "B1",
      name: "Angebot.docx",
      type: "application/x-docx",
      size: 7,
    });
    expect(uploaded).toEqual([
      { token: "st", accountId: "a1", text: "Angebot", type: "application/x-docx" },
    ]);
  });

  it("lets colleagues view a file, not the one who shares it", async () => {
    const { deps, shared } = fakes();
    const app = createDocumentsRoutes(deps);
    const emails = ["anna@weber.test", "Jonas@weber.test", "ANNA@weber.test"];
    const reply = await app.request(post("/share", { fileId: "n1", emails }));
    expect(await reply.json()).toEqual({ shared: ["anna@weber.test"] });
    expect(shared).toEqual([{ owner: "u1", nodeId: "n1", email: "anna@weber.test", role: "view" }]);
    const refused = await app.request(post("/share", { fileId: "foreign", emails }));
    expect(await refused.json()).toEqual({ error: "Das darf nur, wem es gehört." });
  });

  it("shares with a shared mailbox's people, as the mailbox for its own files", async () => {
    const { deps, shared } = fakes();
    const mailboxes: MailboxFolders = {
      foldersFor: async () => [{ accountId: "m1", email: "info@weber.test", folderId: "fi" }],
      peopleOf: async (_email, ids) =>
        ids.includes("m1") ? ["jonas@weber.test", "sandra@weber.test"] : [],
      ownersFor: async () => [
        { id: "mailbox:m1", email: "info@weber.test", name: "info@weber.test" },
      ],
      changed: async () => undefined,
    };
    const app = createDocumentsRoutes({ ...deps, mailboxes });
    const folders = await app.request("/mailboxes", { headers: { cookie: "session" } });
    expect(await folders.json()).toEqual([
      { accountId: "m1", email: "info@weber.test", folderId: "fi" },
    ]);
    const reply = await app.request(
      post("/share", { fileId: "info-file", emails: [], mailboxes: ["m1"] }),
    );
    expect(await reply.json()).toEqual({ shared: ["sandra@weber.test"] });
    expect(shared).toEqual([
      { owner: "mailbox:m1", nodeId: "info-file", email: "sandra@weber.test", role: "view" },
    ]);
  });

  it("has no mailbox folders without Stalwart's admin key", async () => {
    const app = createDocumentsRoutes(fakes().deps);
    const reply = await app.request("/mailboxes", { headers: { cookie: "session" } });
    expect(await reply.json()).toEqual([]);
  });

  it("keeps a colleague's stronger share: who may edit it still may", async () => {
    const { deps, shared } = fakes();
    const app = createDocumentsRoutes(deps);
    const emails = ["anna@weber.test", "sandra@weber.test"];
    const reply = await app.request(post("/share", { fileId: "n2", emails }));
    expect(reply.status).toBe(200);
    expect(shared).toEqual([
      { owner: "u1", nodeId: "n2", email: "sandra@weber.test", role: "view" },
    ]);
  });
});
