import { describe, expect, it } from "vitest";
import type { Mailstore } from "./mailstore";
import { NO_DETAILS, type SignatureDetails } from "./signature";
import { createSignatureDetailRoutes } from "./signature-details-routes";

const setup = (template: { html: string; text: string } | null) => {
  const saved = new Map<string, SignatureDetails>();
  const written: Record<string, unknown>[] = [];
  const mailstore = {
    listIdentities: async () => [{ id: "i1", name: "Anna Weber", email: "anna@weber.test" }],
    updateIdentities: async (_account: string, patches: Record<string, unknown>) => {
      written.push(patches);
      return { ok: true };
    },
  } as unknown as Mailstore;
  const app = createSignatureDetailRoutes({
    store: {
      of: async (id) => saved.get(id) ?? NO_DETAILS,
      save: async (id, details) => {
        saved.set(id, details);
      },
    },
    settings: { signature: async () => template },
    mailstore,
    accountsOf: async (request) =>
      request.headers.get("cookie") ? [{ id: "anna", isPersonal: true } as never] : null,
  });
  const call = (method: string, body?: unknown, signedIn = true) =>
    app.request("/", {
      method,
      headers: { ...(signedIn ? { cookie: "s=1" } : {}), "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  return { call, saved, written };
};

const details = { phone: " 07223 4711 ", mobile: "", position: "Büro", department: "" };

describe("/api/signature-details", () => {
  it("keeps the own details and writes the signature with them at once", async () => {
    const { call, saved, written } = setup({ html: "<p>[Name]<br>Tel. [Telefon]</p>", text: "" });
    const response = await call("PUT", details);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ applied: true });
    expect(saved.get("anna")?.phone).toBe("07223 4711");
    expect(written).toEqual([
      { i1: { htmlSignature: "<p>Anna Weber<br>Tel. 07223 4711</p>", textSignature: "" } },
    ]);
    expect(await (await call("GET")).json()).toEqual({ ...details, phone: "07223 4711" });
  });

  it("only keeps them without a company signature", async () => {
    const { call, written } = setup(null);
    expect(await (await call("PUT", details)).json()).toMatchObject({ applied: false });
    expect(written).toEqual([]);
  });

  it("refuses strangers and what is not details", async () => {
    const { call } = setup(null);
    expect((await call("GET", undefined, false)).status).toBe(401);
    expect((await call("PUT", { phone: 1 })).status).toBe(400);
    expect((await call("PUT", { ...details, position: "x".repeat(121) })).status).toBe(400);
  });
});
