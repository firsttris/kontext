// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Invocation } from "./company/management";
import type { Request } from "./stalwart-setup";
import { ensureStorage, keyPlan, recodePlan, settingsPlan } from "./stalwart-storage";

const done = { compressionAlgorithm: "zstd", blobEncryptionKey: "b" };
const fresh = { compressionAlgorithm: "lz4", blobEncryptionKey: null };

describe("the storage key", () => {
  it("is created once, read from Stalwart's environment variable", () => {
    expect(keyPlan([]).calls).toEqual([
      [
        "x:SymmetricKey/set",
        {
          create: {
            key: {
              description: "Kontext",
              cipher: "aes256Gcm",
              key: { "@type": "EnvironmentVariable", variableName: "STALWART_BLOB_KEY" },
            },
          },
        },
        "0",
      ],
    ]);
  });

  it("is kept when it is there", () => {
    const plan = keyPlan([{ id: "b", description: "Kontext" }]);
    expect(plan).toMatchObject({ calls: [], existing: "b" });
  });
});

describe("the storage settings", () => {
  it("turn on Zstandard and the key for mails and files, then reload", () => {
    const plan = settingsPlan({ Email: fresh, FileStorage: fresh }, "b");
    expect(plan.calls).toEqual([
      [
        "x:Email/set",
        { update: { singleton: { compressionAlgorithm: "zstd", blobEncryptionKey: "b" } } },
        "0",
      ],
      [
        "x:FileStorage/set",
        { update: { singleton: { compressionAlgorithm: "zstd", blobEncryptionKey: "b" } } },
        "1",
      ],
      ["x:Action/set", { create: { r: { "@type": "ReloadSettings" } } }, "2"],
    ]);
  });

  it("only compress without a key", () => {
    const plan = settingsPlan({ Email: fresh, FileStorage: fresh });
    expect(plan.calls[0]).toEqual([
      "x:Email/set",
      { update: { singleton: { compressionAlgorithm: "zstd" } } },
      "0",
    ]);
    expect(plan.message).toContain("nicht verschlüsselt");
  });

  it("change nothing when they are as wanted", () => {
    expect(settingsPlan({ Email: done, FileStorage: done }, "b").calls).toEqual([]);
  });

  it("only touch what is outdated", () => {
    const plan = settingsPlan({ Email: done, FileStorage: fresh }, "b");
    expect(plan.calls.map(([name]) => name)).toEqual(["x:FileStorage/set", "x:Action/set"]);
  });

  it("keep a key the admin chose", () => {
    const own = { compressionAlgorithm: "lz4", blobEncryptionKey: "c" };
    const plan = settingsPlan({ Email: own, FileStorage: own }, "b");
    expect(plan.calls[0]?.[1]).toEqual({
      update: { singleton: { compressionAlgorithm: "zstd", blobEncryptionKey: "c" } },
    });
  });
});

describe("rewriting what is stored", () => {
  it("encrypts with the key and compresses", () => {
    expect(recodePlan("b").calls[0]?.[1]).toEqual({
      create: {
        recode: {
          "@type": "BlobRecode",
          compression: "zstd",
          encryption: { "@type": "Encrypt", keyId: "b" },
        },
      },
    });
  });

  it("keeps the encryption as it is without a key", () => {
    expect(JSON.stringify(recodePlan().calls)).toContain('"encryption":{"@type":"Keep"}');
  });
});

/** A Stalwart with the given settings; the key is created or refused. */
const stalwart = (settings: Record<string, unknown>, keyError?: string) => {
  const names: string[] = [];
  const request: Request = vi.fn(async (calls: Invocation[]) =>
    calls.map(([name, , id]): Invocation => {
      names.push(name);
      if (name === "x:SymmetricKey/get") return [name, { list: [] }, id];
      if (name === "x:SymmetricKey/set")
        return [
          name,
          keyError
            ? { notCreated: { key: { type: "invalidProperties", description: keyError } } }
            : { created: { key: { id: "b" } } },
          id,
        ];
      if (name.endsWith("/get")) return [name, { list: [settings] }, id];
      return [name, {}, id];
    }),
  );
  return { request, names };
};

describe("ensuring the storage", () => {
  it("creates the key, sets the storage and rewrites what is there", async () => {
    const { request, names } = stalwart(fresh);
    const result = await ensureStorage(request);
    expect(result.ok).toBe(true);
    expect(names).toContain("x:SymmetricKey/set");
    expect(names).toContain("x:Action/set");
    expect(names.at(-1)).toBe("x:Task/set");
  });

  it("only compresses, with a hint, when Stalwart refuses the key", async () => {
    const { request, names } = stalwart(
      fresh,
      "Environment variable 'STALWART_BLOB_KEY' not found",
    );
    const result = await ensureStorage(request);
    expect(result.ok && result.value[0]).toContain("STALWART_BLOB_KEY");
    expect(result.ok && result.value[0]).toMatch(/^Hinweis/);
    expect(names.at(-1)).toBe("x:Task/set");
  });

  it("rewrites again when asked, though nothing changed", async () => {
    const { request, names } = stalwart(done);
    const result = await ensureStorage(request, { recode: true });
    expect(names.at(-1)).toBe("x:Task/set");
    expect(result.ok && result.value.at(-1)).toContain("BlobRecode");
  });

  it("starts no rewrite when nothing changed", async () => {
    const { request, names } = stalwart(done);
    await ensureStorage(request);
    expect(names).not.toContain("x:Task/set");
  });
});

describe("ensuring the storage on a Stalwart updated from before 1.0.3", () => {
  /** Its admin role lacks the rights added in 1.0.3: keys and the BlobRecode task. */
  const updated = (): Request =>
    vi.fn(async (calls: Invocation[]) =>
      calls.map(([name, , id]): Invocation => {
        const forbidden = (createId: string) => ({
          notCreated: {
            [createId]: { type: "forbidden", description: "Insufficient permissions" },
          },
        });
        if (name === "x:SymmetricKey/get") return [name, { list: [] }, id];
        if (name === "x:SymmetricKey/set") return [name, forbidden("key"), id];
        if (name === "x:Task/set") return [name, forbidden("recode"), id];
        if (name.endsWith("/get")) return [name, { list: [fresh] }, id];
        return [name, {}, id];
      }),
    );

  it("still compresses and explains the missing rights instead of failing", async () => {
    const result = await ensureStorage(updated());
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.join(" ")).toContain("STALWART_UPDATE_ROLE_PERMISSIONS");
    expect(result.ok && result.value.join(" ")).toContain("BlobRecode");
  });
});
