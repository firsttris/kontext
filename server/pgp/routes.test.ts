// @vitest-environment node
import { encryptKey, generateKey, readKey, readPrivateKey } from "openpgp";
import { describe, expect, it } from "vitest";
import { wkdHash } from "./keys";
import { createPgpRoutes, createWkdRoutes } from "./routes";
import type { KnownKey, OwnKey, PgpStore } from "./store";

const memory = (): PgpStore => {
  const own = new Map<string, OwnKey>();
  const known = new Map<string, KnownKey[]>();
  return {
    own: async (id) => own.get(id) ?? null,
    allOwn: async () => [...own.values()].map(({ email, publicKey }) => ({ email, publicKey })),
    setOwn: async (id, key) => void own.set(id, key),
    removeOwn: async (id) => void own.delete(id),
    known: async (id) => known.get(id) ?? [],
    remember: async (id, key) => {
      const list = (known.get(id) ?? []).filter((k) => k.email !== key.email);
      const before = (known.get(id) ?? []).find((k) => k.email === key.email);
      known.set(id, [
        ...list,
        {
          ...key,
          previousFingerprint:
            before && before.fingerprint !== key.fingerprint ? before.fingerprint : null,
          updatedAt: "",
        },
      ]);
    },
    forget: async (id, email) =>
      void known.set(
        id,
        (known.get(id) ?? []).filter((k) => k.email !== email),
      ),
  } as PgpStore;
};

const keyFor = async (email: string, passphrase?: string) =>
  generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ name: "Test", email }],
    ...(passphrase ? { passphrase } : {}),
    format: "armored",
  });

const setup = (fetched: Record<string, string> = {}) => {
  const store = memory();
  const app = createPgpRoutes({
    store,
    accountsOf: async () => [
      { id: "jonas", isPersonal: true, isReadOnly: false, name: "jonas@weber.test" },
    ],
    fetchKey: async (url) => fetched[url] ?? null,
  });
  const call = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { store, call };
};

describe("/api/pgp", () => {
  it("keeps one's own key only locked, and only for one's own address", async () => {
    const { call } = setup();
    const mine = await keyFor("jonas@weber.test", "passphrase lang genug");
    const recovery = await encryptKey({
      privateKey: await readPrivateKey({ armoredKey: (await keyFor("x@y.test")).privateKey }),
      passphrase: "code",
    });
    // The recovery copy must be the same key.
    expect(
      (
        await call("PUT", "/me", {
          publicKey: mine.publicKey,
          privateKey: mine.privateKey,
          recoveryKey: recovery.armor(),
        })
      ).status,
    ).toBe(400);
    const unlocked = await keyFor("jonas@weber.test");
    expect(
      (
        await call("PUT", "/me", {
          publicKey: unlocked.publicKey,
          privateKey: unlocked.privateKey,
          recoveryKey: unlocked.privateKey,
        })
      ).status,
    ).toBe(400);
    const other = await keyFor("anna@weber.test", "passphrase lang genug");
    expect(
      (
        await call("PUT", "/me", {
          publicKey: other.publicKey,
          privateKey: other.privateKey,
          recoveryKey: other.privateKey,
        })
      ).status,
    ).toBe(400);
    const ok = await call("PUT", "/me", {
      publicKey: mine.publicKey,
      privateKey: mine.privateKey,
      recoveryKey: mine.privateKey,
    });
    expect(ok.status).toBe(200);
    expect(((await (await call("GET", "/me")).json()) as { key: OwnKey }).key.email).toBe(
      "jonas@weber.test",
    );
  });

  it("knows others' keys, from a mail only for its sender, and notes a changed one", async () => {
    const { call } = setup();
    const petra = await keyFor("petra@keller.test");
    expect(
      (
        await call("PUT", "/keys", {
          publicKey: petra.publicKey,
          source: "autocrypt",
          email: "x@other.test",
        })
      ).status,
    ).toBe(400);
    await call("PUT", "/keys", {
      publicKey: petra.publicKey,
      source: "autocrypt",
      email: "petra@keller.test",
    });
    const newer = await keyFor("petra@keller.test");
    const { keys } = (await (
      await call("PUT", "/keys", { publicKey: newer.publicKey, source: "import" })
    ).json()) as { keys: KnownKey[] };
    expect(keys).toHaveLength(1);
    expect(keys[0]!.previousFingerprint).toBe(
      (await readKey({ armoredKey: petra.publicKey })).getFingerprint().toUpperCase(),
    );
  });

  it("looks a key up per WKD, then on keys.openpgp.org", async () => {
    const petra = await keyFor("petra@keller.test");
    const hash = await wkdHash("petra");
    const binary = (await readKey({ armoredKey: petra.publicKey })).write();
    const { call } = setup({
      [`https://keys.openpgp.org/vks/v1/by-email/petra%40keller.test`]: petra.publicKey,
    });
    const found = (await (await call("GET", "/lookup?email=Petra@Keller.test")).json()) as {
      source: string;
    };
    expect(found.source).toBe("keyserver");
    const wkd = createPgpRoutes({
      store: memory(),
      accountsOf: async () => [{ id: "j", isPersonal: true, isReadOnly: false, name: "j@w.test" }],
      fetchKey: async (url) =>
        url.startsWith(
          `https://openpgpkey.keller.test/.well-known/openpgpkey/keller.test/hu/${hash}`,
        )
          ? binary
          : null,
    });
    expect(
      ((await (await wkd.request("/lookup?email=petra@keller.test")).json()) as { source: string })
        .source,
    ).toBe("wkd");
  });
});

describe("WKD for the company", () => {
  it("gives the binary key by the hash of the local part", async () => {
    const { store, call } = setup();
    const mine = await keyFor("jonas@weber.test", "passphrase lang genug");
    await call("PUT", "/me", {
      publicKey: mine.publicKey,
      privateKey: mine.privateKey,
      recoveryKey: mine.privateKey,
    });
    const wkd = createWkdRoutes(store);
    const hash = await wkdHash("jonas");
    const response = await wkd.request(`/weber.test/hu/${hash}?l=jonas`);
    expect(response.status).toBe(200);
    const key = await readKey({ binaryKey: new Uint8Array(await response.arrayBuffer()) });
    expect(key.getUserIDs()[0]).toContain("jonas@weber.test");
    expect((await wkd.request(`/other.test/hu/${hash}`)).status).toBe(404);
  });
});
