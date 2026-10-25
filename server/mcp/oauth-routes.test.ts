// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { type ConsentDeps, createConsentRoutes } from "./oauth-routes";

const tokens = { accessToken: "at", refreshToken: "rt", accessExpiresAt: new Date() };
const query = new URLSearchParams({
  client_id: "claude",
  scope: "openid offline_access read write",
  sig: "s",
}).toString();

const deps = (patch: Partial<ConsentDeps> = {}) => {
  const connections = {
    openSession: vi.fn(async () => "s2"),
    dropSession: vi.fn(async () => undefined),
    createOAuth: vi.fn(async () => ({}) as never),
  };
  const api = {
    consent: vi.fn(async (body: { accept: boolean }) => ({
      url: body.accept
        ? "https://claude.ai/cb?code=c1"
        : "https://claude.ai/cb?error=access_denied",
    })),
    clientName: vi.fn(async () => "Claude"),
  };
  const save = vi.fn(async () => undefined);
  const all: ConsentDeps = {
    api,
    connections,
    grants: { save },
    userOf: async () => ({ id: "u1", email: "jonas@weber-haustechnik.test" }),
    login: async () => ({ status: "ok", tokens }),
    ...patch,
  };
  return { all, api, connections, save };
};

const post = (body: unknown) =>
  new Request("http://kontext.test/consent", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "session=x" },
    body: JSON.stringify(body),
  });

describe("/api/mcp-oauth/consent", () => {
  it("allows after the password, with the person's choice of rights and an own grant", async () => {
    const { all, api, connections, save } = deps();
    const response = await createConsentRoutes(all).request(
      post({ oauth_query: query, accept: true, write: false, password: "geheim" }),
    );
    expect(await response.json()).toEqual({ url: "https://claude.ai/cb?code=c1" });
    expect(api.consent).toHaveBeenCalledWith(
      { accept: true, scope: "openid offline_access read", oauth_query: query },
      expect.any(Headers),
    );
    expect(save).toHaveBeenCalledWith("s2", tokens);
    expect(connections.createOAuth).toHaveBeenCalledWith("u1", "s2", "Claude", "claude", ["read"]);
  });

  it("declines without a password and without a connection", async () => {
    const { all, api, connections } = deps();
    const response = await createConsentRoutes(all).request(
      post({ oauth_query: query, accept: false }),
    );
    expect(await response.json()).toEqual({ url: "https://claude.ai/cb?error=access_denied" });
    expect(api.consent).toHaveBeenCalledWith(
      { accept: false, oauth_query: query },
      expect.any(Headers),
    );
    expect(connections.openSession).not.toHaveBeenCalled();
  });

  it("asks for the code, refuses a wrong password, and connects nothing then", async () => {
    const mfa = deps({ login: async () => ({ status: "mfa" }) });
    const ask = await createConsentRoutes(mfa.all).request(
      post({ oauth_query: query, accept: true, password: "p" }),
    );
    expect(await ask.json()).toEqual({ status: "mfa" });
    const wrong = deps({ login: async () => ({ status: "failed" }) });
    const refused = await createConsentRoutes(wrong.all).request(
      post({ oauth_query: query, accept: true, password: "p" }),
    );
    expect(refused.status).toBe(401);
    expect(wrong.api.consent).not.toHaveBeenCalled();
    expect(wrong.connections.openSession).not.toHaveBeenCalled();
  });

  it("connects nothing when the provider refuses the request (expired, forged)", async () => {
    const { all, connections } = deps();
    all.api.consent = async () => {
      throw new Error("invalid_signature");
    };
    const response = await createConsentRoutes(all).request(
      post({ oauth_query: query, accept: true, password: "geheim" }),
    );
    expect(response.status).toBe(400);
    expect(connections.openSession).not.toHaveBeenCalled();
  });

  it("wants a signed-in person and a request", async () => {
    const signedOut = deps({ userOf: async () => null });
    expect(
      (await createConsentRoutes(signedOut.all).request(post({ oauth_query: query, accept: true })))
        .status,
    ).toBe(401);
    const { all } = deps();
    expect((await createConsentRoutes(all).request(post({ accept: true }))).status).toBe(400);
    expect(
      (
        await createConsentRoutes(all).request(
          post({ oauth_query: "sig=s", accept: true, password: "p" }),
        )
      ).status,
    ).toBe(400);
  });
});
