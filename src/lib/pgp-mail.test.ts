// @vitest-environment node
import { createMessage, generateKey, readKey, sign } from "openpgp";
import { describe, expect, it } from "vitest";
import { checkSigned, encryptedPreview, encryptMail, pgpKind, readEncrypted } from "./pgp-mail";

const person = async (email: string) => {
  const { privateKey, publicKey } = await generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ email }],
    format: "object",
  });
  return { privateKey, publicKey: publicKey.armor() };
};

describe("PGP in mails", () => {
  it("knows encrypted and signed mails", () => {
    expect(
      pgpKind('multipart/encrypted; protocol="application/pgp-encrypted"; boundary=x', ""),
    ).toBe("encrypted");
    expect(
      pgpKind("text/plain", "Hallo\n-----BEGIN PGP MESSAGE-----\nx\n-----END PGP MESSAGE-----"),
    ).toBe("encrypted");
    expect(
      pgpKind('multipart/signed; protocol="application/pgp-signature"; micalg=pgp-sha256', ""),
    ).toBe("signed");
    expect(pgpKind("multipart/alternative", "Hallo")).toBeNull();
    expect(encryptedPreview("Version: 1 -----BEGIN PGP MESSAGE----- wcBMA")).toBe(true);
    expect(encryptedPreview("Hallo Jonas")).toBe(false);
    expect(encryptedPreview("", ' multipart/encrypted; protocol="application/pgp-encrypted"')).toBe(
      true,
    );
  });

  it("encrypted for the recipient and oneself, signed, read back with attachments", async () => {
    const jonas = await person("jonas@w.test");
    const petra = await person("petra@k.test");
    const raw = await encryptMail({
      envelope: {
        from: { name: "Jonas", email: "jonas@w.test" },
        to: [{ name: "Petra", email: "petra@k.test" }],
        cc: [],
        subject: "Befund",
        date: new Date(),
        messageId: "m1@w.test",
      },
      content: {
        text: "Vertraulich: Werte im Anhang.",
        html: "<p>Vertraulich: Werte im Anhang.</p>",
        attachments: [
          { name: "Werte.pdf", type: "application/pdf", bytes: new Uint8Array([7, 8]) },
        ],
      },
      recipientKeys: [petra.publicKey],
      ownKey: jonas.privateKey,
      id: "t1",
    });
    expect(raw).not.toContain("Werte im Anhang");
    // The subject goes inside; outside only a stand-in (Protected Headers).
    expect(raw).toContain("Subject: Vertrauliche Nachricht");
    expect(raw).not.toContain("Befund");
    const read = await readEncrypted(raw, petra.privateKey, [jonas.publicKey]);
    expect(read.subject).toBe("Befund");
    expect(read.text).toContain("Vertraulich: Werte im Anhang.");
    expect(read.html).toContain("<p>Vertraulich");
    expect(read.attachments[0]).toMatchObject({ name: "Werte.pdf", type: "application/pdf" });
    expect(read.signature.state).toBe("valid");
    // The copy in Sent: Jonas reads it too; without Jonas' key known, the signature is unknown.
    const own = await readEncrypted(raw, jonas.privateKey, []);
    expect(own.signature.state).toBe("unknown");
    // Someone else's key does not open it.
    const other = await person("x@y.test");
    await expect(readEncrypted(raw, other.privateKey, [])).rejects.toThrow();
  }, 30_000);

  it("checks a signed mail and notices a change", async () => {
    const petra = await person("petra@k.test");
    const signed = "Content-Type: text/plain; charset=utf-8\r\n\r\nDie Rechnung ist bezahlt.";
    const signature = await sign({
      message: await createMessage({ binary: new TextEncoder().encode(signed) }),
      signingKeys: petra.privateKey,
      detached: true,
    });
    const raw = [
      "From: petra@k.test",
      'Content-Type: multipart/signed; micalg=pgp-sha256; protocol="application/pgp-signature"; boundary="b1"',
      "",
      "--b1",
      signed,
      "--b1",
      "Content-Type: application/pgp-signature",
      "",
      signature as string,
      "--b1--",
      "",
    ].join("\r\n");
    const type = 'multipart/signed; protocol="application/pgp-signature"; boundary="b1"';
    expect((await checkSigned(raw, type, [petra.publicKey])).state).toBe("valid");
    expect(
      (await checkSigned(raw.replace("bezahlt", "offen"), type, [petra.publicKey])).state,
    ).toBe("invalid");
    expect((await readKey({ armoredKey: petra.publicKey })).isPrivate()).toBe(false);
  }, 30_000);
});
