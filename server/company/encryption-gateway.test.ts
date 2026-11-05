import { describe, expect, it } from "vitest";
import {
  createEncryptionGateway,
  encryptionGatewayRoutes,
  toRecipientKey,
} from "./encryption-gateway";
import type { Invocation } from "./management";

/** A Stalwart that keeps the calls and answers the gets; `denied` like a key without the rights. */
const fakeStalwart = ({ denied = false } = {}) => {
  const calls: Invocation[] = [];
  const request = async (methodCalls: Invocation[]): Promise<Invocation[]> => {
    if (denied) throw new Error("forbidden");
    calls.push(...methodCalls);
    return methodCalls.map(([name, , id]): Invocation => {
      if (name === "x:Encryption/get") return [name, { list: [{ gatewayEnable: true }] }, id];
      if (name === "x:ExternalPublicKey/get")
        return [
          name,
          {
            list: [
              {
                id: "k2",
                emailAddress: "steuer@kanzlei.de",
                source: { "@type": "Automatic", method: "wkd" },
              },
              {
                id: "k1",
                emailAddress: "bauamt@stadt.de",
                source: { "@type": "Manual" },
                fingerprint: "ABCD",
              },
            ],
          },
          id,
        ];
      return [name, {}, id];
    });
  };
  const app = encryptionGatewayRoutes(createEncryptionGateway(request));
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { calls, send };
};

describe("toRecipientKey", () => {
  it("names where the key comes from and whether Stalwart has looked yet", () => {
    const harvested = { id: "1", emailAddress: "a@b.de", source: { "@type": "HarvestedPgp" } };
    expect(toRecipientKey(harvested)).toMatchObject({ origin: "harvested", checked: true });
    const vks = { ...harvested, source: { "@type": "Automatic", method: "vks" } };
    expect(toRecipientKey(vks)).toMatchObject({ origin: "vks", checked: false });
    expect(toRecipientKey({ ...vks, lastChecked: "2026-11-05T10:00:00Z" }).checked).toBe(true);
  });
});

describe("Mails beim Versand verschlüsseln", () => {
  it("shows the switch and the keys sorted by address", async () => {
    const { send } = fakeStalwart();
    const view = await (await send("GET", "/")).json();
    expect(view.known).toBe(true);
    expect(view.enabled).toBe(true);
    expect(view.keys.map((key: { email: string }) => key.email)).toEqual([
      "bauamt@stadt.de",
      "steuer@kanzlei.de",
    ]);
  });

  it("switches the gateway and reloads Stalwart's settings", async () => {
    const { calls, send } = fakeStalwart();
    expect((await send("PUT", "/", { enabled: false })).status).toBe(200);
    expect(calls.slice(0, 2)).toEqual([
      ["x:Encryption/set", { update: { singleton: { gatewayEnable: false } } }, "0"],
      ["x:Action/set", { create: { r: { "@type": "ReloadSettings" } } }, "0"],
    ]);
  });

  it("adds a pasted key or an address Stalwart looks up, and removes one", async () => {
    const { calls, send } = fakeStalwart();
    await send("POST", "/keys", { email: " Bauamt@Stadt.de ", key: "-----BEGIN PGP…" });
    await send("POST", "/keys", { email: "steuer@kanzlei.de", lookup: "vks" });
    await send("DELETE", "/keys/k1");
    const sets = calls.filter(([name]) => name === "x:ExternalPublicKey/set").map(([, a]) => a);
    expect(sets).toEqual([
      {
        create: {
          k: {
            emailAddress: "bauamt@stadt.de",
            key: "-----BEGIN PGP…",
            source: { "@type": "Manual" },
          },
        },
      },
      {
        create: {
          k: {
            emailAddress: "steuer@kanzlei.de",
            source: { "@type": "Automatic", method: "vks" },
          },
        },
      },
      { destroy: ["k1"] },
    ]);
  });

  it("refuses an address that is none", async () => {
    const { send } = fakeStalwart();
    expect((await send("POST", "/keys", { email: "kein", lookup: "wkd" })).status).toBe(400);
  });

  it("says when the server's key lacks the rights", async () => {
    const { send } = fakeStalwart({ denied: true });
    expect(await (await send("GET", "/")).json()).toEqual({
      known: false,
      enabled: false,
      keys: [],
    });
  });
});
