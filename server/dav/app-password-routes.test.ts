// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { type AppPasswordDeps, createAppPasswordRoutes } from "./app-password-routes";

const tokens = { accessToken: "at", refreshToken: "rt", accessExpiresAt: new Date() };
const info = { id: "p1", name: "Thunderbird Büro", createdAt: "x", lastUsedAt: null };

const store = () => ({
  openSession: vi.fn(async () => "s2"),
  dropSession: vi.fn(async () => undefined),
  create: vi.fn(async () => ({ password: "abcd-efgh-jkmn-pqrs-tuvw", info })),
  list: async () => [info],
  remove: async (userId: string, id: string) => userId === "u1" && id === "p1",
});

const deps = (patch: Partial<AppPasswordDeps> = {}): AppPasswordDeps => ({
  appPasswords: store(),
  grants: { save: vi.fn() },
  userOf: async () => ({ id: "u1", email: "jonas@weber-haustechnik.test" }),
  login: async () => ({ status: "ok", tokens }),
  mayTryPassword: () => true,
  ...patch,
});

const post = (body: unknown) =>
  new Request("http://kontext.test/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("/api/app-passwords", () => {
  it("lists the own app passwords, only when signed in", async () => {
    expect(await (await createAppPasswordRoutes(deps()).request("/")).json()).toEqual({
      appPasswords: [info],
    });
    const signedOut = createAppPasswordRoutes(deps({ userOf: async () => null }));
    expect((await signedOut.request("/")).status).toBe(401);
    expect((await signedOut.request(post({ name: "x", password: "p" }))).status).toBe(401);
  });

  it("makes one after signing in at Stalwart again, with a grant of its own", async () => {
    const save = vi.fn();
    const login = vi.fn(async () => ({ status: "ok" as const, tokens }));
    const own = store();
    const app = createAppPasswordRoutes(deps({ login, appPasswords: own, grants: { save } }));
    const response = await app.request(
      post({ name: "Thunderbird Büro", password: "geheim", code: "123456" }),
    );
    expect(await response.json()).toEqual({
      status: "ok",
      password: "abcd-efgh-jkmn-pqrs-tuvw",
      info,
    });
    expect(login).toHaveBeenCalledWith({
      email: "jonas@weber-haustechnik.test",
      password: "geheim",
      code: "123456",
    });
    expect(own.openSession).toHaveBeenCalledWith("u1", "Thunderbird Büro");
    expect(save).toHaveBeenCalledWith("s2", tokens);
    expect(own.create).toHaveBeenCalledWith("u1", "s2", "Thunderbird Büro");
  });

  it("drops the session when the grant cannot be stored", async () => {
    const own = store();
    const app = createAppPasswordRoutes(
      deps({
        appPasswords: own,
        grants: {
          save: async () => {
            throw new Error("disk full");
          },
        },
      }),
    );
    expect((await app.request(post({ name: "x", password: "p" }))).status).toBe(500);
    expect(own.dropSession).toHaveBeenCalledWith("s2");
    expect(own.create).not.toHaveBeenCalled();
  });

  it("asks for the code, refuses a wrong password and counts the tries", async () => {
    const mfa = createAppPasswordRoutes(deps({ login: async () => ({ status: "mfa" }) }));
    expect(await (await mfa.request(post({ name: "x", password: "p" }))).json()).toEqual({
      status: "mfa",
    });
    const wrong = createAppPasswordRoutes(deps({ login: async () => ({ status: "failed" }) }));
    expect((await wrong.request(post({ name: "x", password: "p" }))).status).toBe(401);
    expect((await wrong.request(post({ name: " ", password: "p" }))).status).toBe(400);
    const login = vi.fn(async () => ({ status: "ok" as const, tokens }));
    const limited = createAppPasswordRoutes(deps({ login, mayTryPassword: () => false }));
    expect((await limited.request(post({ name: "x", password: "p" }))).status).toBe(429);
    expect(login).not.toHaveBeenCalled();
  });

  it("revokes only the own", async () => {
    const app = createAppPasswordRoutes(deps());
    expect((await app.request("/p1", { method: "DELETE" })).status).toBe(200);
    expect((await app.request("/p9", { method: "DELETE" })).status).toBe(404);
  });
});
