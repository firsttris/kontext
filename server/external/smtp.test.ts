import { afterEach, describe, expect, it } from "vitest";
import { startFakeSmtp } from "../../e2e/fake-smtp";
import { createSmtp } from "./smtp";

const login = { user: "t@gmail.com", password: "app-pass" };
const raw = new TextEncoder().encode(
  "From: t@gmail.com\r\nTo: a@x.de\r\nSubject: Hallo\r\n\r\nHi\r\n",
);
let close: (() => Promise<unknown>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

describe("createSmtp", () => {
  it("sends with the envelope and names recipients the server turned down", async () => {
    const server = await startFakeSmtp(login, ["bad@x.de"]);
    close = server.close;
    const endpoint = { host: "127.0.0.1", port: server.port };
    const result = await createSmtp(true).send(
      endpoint,
      login,
      { from: "t@gmail.com", to: ["good@x.de", "bad@x.de"] },
      raw,
    );
    expect(result).toEqual({ ok: true, refused: ["bad@x.de"] });
    expect(server.received.map((mail) => mail.to)).toEqual([["good@x.de"]]);
  });

  it("tells a refused login from an unreachable server", async () => {
    const server = await startFakeSmtp(login);
    close = server.close;
    const endpoint = { host: "127.0.0.1", port: server.port };
    expect(await createSmtp(true).check(endpoint, { ...login, password: "falsch" })).toMatchObject({
      ok: false,
      error: { reason: "login" },
    });
    expect(await createSmtp(true).check(endpoint, login)).toEqual({ ok: true });
  });
});

describe("servers inside the network", () => {
  it("are never connected to, for checking or sending", async () => {
    const smtp = createSmtp(false, async () => null);
    const login = { user: "a", password: "b" };
    const endpoint = { host: "smtp.rebind.test", port: 465 };
    expect(await smtp.check(endpoint, login)).toMatchObject({
      ok: false,
      error: { reason: "outside" },
    });
    expect(
      await smtp.send(endpoint, login, { from: "a@x.test", to: ["b@y.test"] }, new Uint8Array()),
    ).toMatchObject({ ok: false, error: { reason: "outside" } });
  });
});
