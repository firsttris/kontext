// @vitest-environment node
import { generateKey } from "openpgp";
import { describe, expect, it } from "vitest";
import { groupFingerprint, lockedPrivateKey, publicKeyInfo, wkdHash } from "./keys";

describe("OpenPGP keys", () => {
  it("reads a public key's addresses and fingerprint; a secret one only if locked", async () => {
    const { publicKey, privateKey } = await generateKey({
      type: "ecc",
      curve: "curve25519Legacy",
      userIDs: [{ name: "Jonas Weber", email: "Jonas@Weber.test" }],
      passphrase: "geheim lang genug",
      format: "armored",
    });
    const info = await publicKeyInfo(publicKey);
    expect(info?.emails).toEqual(["jonas@weber.test"]);
    expect(info?.fingerprint).toMatch(/^[0-9A-F]{40,64}$/);
    expect(await publicKeyInfo(privateKey)).toBeNull();
    expect(await lockedPrivateKey(privateKey)).toBe(info?.fingerprint);
    expect(await publicKeyInfo("kein Schlüssel")).toBeNull();
    const open = await generateKey({ userIDs: [{ email: "x@y.test" }], format: "armored" });
    expect(await lockedPrivateKey(open.privateKey)).toBeNull();
  });

  it("names an address for WKD as the draft does", async () => {
    // The example of draft-koch-openpgp-webkey-service: "Joe.Doe" → this hash.
    expect(await wkdHash("Joe.Doe")).toBe("iy9q119eutrkn8s1mk4r39qejnbu3n5q");
    expect(groupFingerprint("ABCD1234EF56")).toBe("ABCD 1234 EF56");
  });
});
