/** A personal OpenPGP key for a test person, set as Kontext keeps it. */
import { expect, type Page } from "@playwright/test";
import { encryptKey, generateKey, readPrivateKey } from "openpgp";
import { address } from "./helpers";

export const PASSPHRASE = "Im Keller steht die Pumpe";

/** A key for the signed-in person, set as Kontext keeps it; returns the public key. */
export const giveKey = async (page: Page, user: string) => {
  const { privateKey, publicKey } = await generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ name: user, email: address(user) }],
    passphrase: PASSPHRASE,
    format: "armored",
  });
  const open = await readPrivateKey({ armoredKey: privateKey });
  const { decryptKey } = await import("openpgp");
  const recovery = await encryptKey({
    privateKey: await decryptKey({ privateKey: open, passphrase: PASSPHRASE }),
    passphrase: "CODE-CODE-CODE-CODE-CODE-CODE",
  });
  const response = await page.request.put("/api/pgp/me", {
    data: { publicKey, privateKey, recoveryKey: recovery.armor() },
  });
  expect(response.ok()).toBe(true);
  return publicKey;
};
