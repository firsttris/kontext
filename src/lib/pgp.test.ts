// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  autocryptHeader,
  createOwnKey,
  describeKey,
  importOwnKey,
  normalizeCode,
  readAutocrypt,
  recoveryCode,
  unlockKey,
} from "./pgp";

describe("one's own key", () => {
  it("is locked twice: the passphrase and the recovery code open it, nothing else", async () => {
    const key = await createOwnKey("Jonas Weber", "jonas@weber.test", "eine lange Passphrase");
    expect(key.recoveryCode).toMatch(/^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/);
    expect(key.privateKey).toContain("PRIVATE KEY");
    await expect(unlockKey(key.privateKey, "eine lange Passphrase")).resolves.toBeTruthy();
    await expect(unlockKey(key.privateKey, "falsch")).rejects.toThrow();
    const typed = key.recoveryCode.toLowerCase().replace(/-/g, " ");
    await expect(unlockKey(key.recoveryKey, normalizeCode(typed))).resolves.toBeTruthy();
    expect((await describeKey(key.publicKey))?.userIds[0]).toContain("jonas@weber.test");
  }, 20_000);

  it("takes a key along from elsewhere, with a new passphrase", async () => {
    const before = await createOwnKey("Jonas", "jonas@weber.test", "alte Passphrase lang");
    const moved = await importOwnKey(
      before.privateKey,
      "alte Passphrase lang",
      "neue Passphrase lang",
    );
    await expect(unlockKey(moved.privateKey, "neue Passphrase lang")).resolves.toBeTruthy();
    expect((await describeKey(moved.publicKey))?.fingerprint).toBe(
      (await describeKey(before.publicKey))?.fingerprint,
    );
  }, 20_000);

  it("recovery codes differ and read back however typed", () => {
    expect(recoveryCode()).not.toBe(recoveryCode());
    expect(normalizeCode("k7qp 2mxr-abcd efgh ijkl mnop")).toBe("K7QP-2MXR-ABCD-EFGH-IJKL-MNOP");
  });
});

describe("Autocrypt", () => {
  it("writes and reads the header with the key", async () => {
    const key = await createOwnKey("Petra", "petra@keller.test", "eine lange Passphrase");
    const header = await autocryptHeader("petra@keller.test", key.publicKey);
    expect(header).toMatch(
      /^addr=petra@keller.test; prefer-encrypt=mutual; keydata=[A-Za-z0-9+/=]+$/,
    );
    const read = await readAutocrypt(header.replace(/(.{70})/g, "$1\r\n "));
    expect(read?.addr).toBe("petra@keller.test");
    expect((await describeKey(read!.publicKey))?.fingerprint).toBe(
      (await describeKey(key.publicKey))?.fingerprint,
    );
    expect(await readAutocrypt("addr=x@y.test")).toBeNull();
  }, 20_000);
});
