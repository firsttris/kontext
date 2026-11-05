import { describe, expect, it } from "vitest";
import type { JmapClient } from "./client";
import {
  ensurePublicKey,
  forgetPublicKey,
  getEncryptionAtRest,
  keyWithFingerprint,
  setEncryptionAtRest,
} from "./encryption-at-rest";

/** A client that answers each method from the table and records the calls. */
const fake = (answers: Record<string, unknown>) => {
  const calls: [string, Record<string, unknown>][] = [];
  const client = {
    call: async (method: string, args: Record<string, unknown>) => {
      calls.push([method, args]);
      return answers[method];
    },
  } as unknown as JmapClient;
  return { client, calls };
};

describe("encryption at rest", () => {
  it("finds one's key by its fingerprint, in any case", () => {
    const keys = [
      { id: "a", fingerprints: ["1111"] },
      { id: "b", fingerprints: ["ABCD", "EF01"] },
    ];
    expect(keyWithFingerprint(keys, "abcd")?.id).toBe("b");
    expect(keyWithFingerprint(keys, "9999")).toBeUndefined();
  });

  it("is off when the account says nothing", async () => {
    const { client } = fake({ "x:AccountSettings/get": { list: [{}] } });
    expect(await getEncryptionAtRest(client)).toEqual({ "@type": "Disabled" });
  });

  it("registers the key once and points the account at it", async () => {
    const { client, calls } = fake({
      "x:PublicKey/get": { list: [{ id: "old", fingerprints: ["0000"] }] },
      "x:PublicKey/set": { created: { key: { id: "k1" } } },
      "x:AccountSettings/set": { updated: { singleton: null } },
    });
    const id = await ensurePublicKey(client, "-----BEGIN PGP PUBLIC KEY BLOCK-----", "ABCD");
    expect(id).toBe("k1");
    expect(calls[1]![1]).toEqual({
      create: { key: { key: "-----BEGIN PGP PUBLIC KEY BLOCK-----", description: "Kontext" } },
    });
    await setEncryptionAtRest(client, { "@type": "Enabled", publicKey: id, encryptOnAppend: true });
    expect(calls[2]).toEqual([
      "x:AccountSettings/set",
      {
        update: {
          singleton: {
            encryptionAtRest: { "@type": "Enabled", publicKey: "k1", encryptOnAppend: true },
          },
        },
      },
    ]);
  });

  it("takes a key that is already registered", async () => {
    const { client, calls } = fake({
      "x:PublicKey/get": { list: [{ id: "k1", fingerprints: ["ABCD"] }] },
    });
    expect(await ensurePublicKey(client, "key", "abcd")).toBe("k1");
    expect(calls.map(([method]) => method)).toEqual(["x:PublicKey/get"]);
  });

  it("takes the key with that fingerprint off the server, and nothing else", async () => {
    const { client, calls } = fake({
      "x:PublicKey/get": {
        list: [
          { id: "other", fingerprints: ["1111"] },
          { id: "k1", fingerprints: ["ABCD"] },
        ],
      },
      "x:PublicKey/set": { destroyed: ["k1"] },
    });
    await forgetPublicKey(client, "abcd");
    expect(calls[1]).toEqual(["x:PublicKey/set", { destroy: ["k1"] }]);
    const none = fake({ "x:PublicKey/get": { list: [{ id: "other", fingerprints: ["1111"] }] } });
    await forgetPublicKey(none.client, "abcd");
    expect(none.calls.map(([method]) => method)).toEqual(["x:PublicKey/get"]);
  });

  it("says when Stalwart refuses", async () => {
    const { client } = fake({
      "x:AccountSettings/set": {
        notUpdated: { singleton: { type: "invalidProperties", description: "no key" } },
      },
    });
    await expect(setEncryptionAtRest(client, { "@type": "Disabled" })).rejects.toThrow("no key");
  });
});
