// @vitest-environment node
import { decryptKey, generateKey, readPrivateKey } from "openpgp";
import { describe, expect, it } from "vitest";
import {
  fragmentToKey,
  keyToFragment,
  newSecureKey,
  seal,
  secureCode,
  unseal,
  unwrapForSender,
  wrapForSender,
} from "./secure";

describe("confidential messages in the browser", () => {
  it("sealed with the link's key, opened only with it, a change is noticed", async () => {
    const key = newSecureKey();
    const fragment = keyToFragment(key);
    expect(fragment).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const sealed = await seal(key, { subject: "Befund", text: "Werte: 42" });
    expect(sealed).not.toContain("Werte");
    await expect(unseal(fragmentToKey(`#${fragment}`), sealed)).resolves.toEqual({
      subject: "Befund",
      text: "Werte: 42",
    });
    await expect(unseal(newSecureKey(), sealed)).rejects.toThrow();
    const changed = `${sealed.slice(0, 30)}${sealed[30] === "A" ? "B" : "A"}${sealed.slice(31)}`;
    await expect(unseal(key, changed)).rejects.toThrow();
  });

  it("codes are short to say and differ", () => {
    expect(secureCode()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(secureCode()).not.toBe(secureCode());
  });

  it("the sender keeps the key locked with their own OpenPGP key", async () => {
    const { privateKey, publicKey } = await generateKey({
      type: "ecc",
      curve: "curve25519Legacy",
      userIDs: [{ email: "jonas@w.test" }],
      passphrase: "lang genug hier",
      format: "armored",
    });
    const key = newSecureKey();
    const wrapped = await wrapForSender(key, publicKey);
    const open = await decryptKey({
      privateKey: await readPrivateKey({ armoredKey: privateKey }),
      passphrase: "lang genug hier",
    });
    expect(await unwrapForSender(wrapped, open)).toEqual(key);
  }, 20_000);
});
