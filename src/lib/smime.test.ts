// @vitest-environment node
import forge from "node-forge";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type OwnSmime,
  openP12,
  readCertificate,
  readSmime,
  smimeKind,
  smimeMail,
  smimeSignedMail,
} from "./smime";

/** A self-signed certificate for an address, as a .p12 file locked with a password. */
const makeP12 = (email: string, password: string) => {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "0a1b2c";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  const name = [{ name: "commonName", value: email }];
  cert.setSubject(name);
  cert.setIssuer(name);
  cert.setExtensions([{ name: "subjectAltName", altNames: [{ type: 1, value: email }] }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: "3des",
  });
  const der = forge.asn1.toDer(p12).getBytes();
  return {
    p12: Uint8Array.from(der, (c) => c.charCodeAt(0)),
    pem: forge.pki.certificateToPem(cert),
  };
};

const envelope = {
  from: { name: "Jonas Weber", email: "jonas@weber.test" },
  to: [{ name: null, email: "amt@stadt.test" }],
  cc: [],
  subject: "Antrag",
  date: new Date("2026-10-25T08:00:00Z"),
  messageId: "antrag@weber.test",
};

let jonas: OwnSmime;
let amt: OwnSmime;
let amtPem: string;

beforeAll(async () => {
  jonas = await openP12(makeP12("jonas@weber.test", "geheim").p12, "geheim");
  const made = makeP12("amt@stadt.test", "amt");
  amt = await openP12(made.p12, "amt");
  amtPem = made.pem;
});

describe("S/MIME", () => {
  it("knows encrypted and signed mails by their type", () => {
    expect(smimeKind('application/pkcs7-mime; smime-type=enveloped-data; name="smime.p7m"')).toBe(
      "encrypted",
    );
    expect(smimeKind("application/x-pkcs7-mime; name=smime.p7m")).toBe("encrypted");
    expect(smimeKind("application/pkcs7-mime; smime-type=signed-data")).toBe("signed");
    expect(
      smimeKind('multipart/signed; protocol="application/pkcs7-signature"; boundary="b"'),
    ).toBe("signed");
    expect(smimeKind('multipart/signed; protocol="application/pgp-signature"')).toBeNull();
    expect(smimeKind("text/plain")).toBeNull();
  });

  it("opens a .p12 only with its password", async () => {
    const { p12 } = makeP12("jonas@weber.test", "geheim");
    const own = await openP12(p12, "geheim");
    expect(own.info.emails).toEqual(["jonas@weber.test"]);
    expect(own.info.fingerprint).toMatch(/^[0-9A-F]{64}$/);
    expect(own.info.selfSigned).toBe(true);
    await expect(openP12(p12, "falsch")).rejects.toThrow();
  });

  it("reads a certificate file as PEM and as DER", async () => {
    const pem = new TextEncoder().encode(amtPem);
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(forge.pki.certificateFromPem(amtPem)));
    const fromPem = await readCertificate(pem);
    const fromDer = await readCertificate(Uint8Array.from(der.getBytes(), (c) => c.charCodeAt(0)));
    expect(fromPem.info.emails).toEqual(["amt@stadt.test"]);
    expect(fromDer.info.fingerprint).toBe(fromPem.info.fingerprint);
  });

  it("sends signed and encrypted: the recipient and oneself can read it, no one else", async () => {
    const raw = await smimeMail({
      envelope,
      content: { text: "Anbei der Antrag – vertraulich.", html: "<p>Anbei</p>", attachments: [] },
      recipientCerts: [amtPem],
      own: jonas,
      id: "t1",
    });
    expect(raw).toMatch(/^From: Jonas Weber <jonas@weber.test>/);
    expect(raw).toContain("smime-type=enveloped-data");
    expect(raw).not.toContain("vertraulich");
    expect(raw).toContain("Subject: Vertrauliche Nachricht");
    expect(raw).not.toContain("Antrag");
    for (const reader of [amt, jonas]) {
      const read = await readSmime(raw, reader);
      expect(read.text.trim()).toBe("Anbei der Antrag – vertraulich.");
      expect(read.subject).toBe("Antrag");
      expect(read.encrypted).toBe(true);
      expect(read.signature).toMatchObject({ state: "valid", email: "jonas@weber.test" });
    }
    const stranger = await openP12(makeP12("x@y.test", "x").p12, "x");
    await expect(readSmime(raw, stranger)).rejects.toThrow();
  });

  it("finds a changed signed text", async () => {
    const raw = await smimeMail({
      envelope,
      content: { text: "Betrag: 100 Euro", html: "<p>100</p>", attachments: [] },
      recipientCerts: [],
      own: jonas,
      id: "t2",
    });
    // Decrypt to the signed entity, change it, read it as a signed mail.
    const der = (await import("postal-mime")).default.parse(raw);
    const p7m = (await der).attachments[0]!.content as ArrayBuffer;
    const message = forge.pkcs7.messageFromAsn1(
      forge.asn1.fromDer(String.fromCharCode(...new Uint8Array(p7m))),
    ) as forge.pkcs7.PkcsEnvelopedData;
    message.decrypt(message.findRecipient(jonas.cert)!, jonas.key);
    const signed = (message.content as forge.util.ByteStringBuffer).getBytes();
    expect((await readSmime(signed, null)).signature.state).toBe("valid");
    const changed = signed.replace(
      /^([A-Za-z0-9+/]{8})/m,
      (line: string) => `${line.slice(0, 7)}A`,
    );
    expect(changed).not.toBe(signed);
    expect((await readSmime(changed, null)).signature.state).toBe("invalid");
  });

  it("signs without encrypting: readable as it is, the signature holds", async () => {
    const raw = await smimeSignedMail({
      envelope,
      content: { text: "Anbei der Antrag.", html: "<p>Anbei</p>", attachments: [] },
      own: jonas,
      id: "t3",
    });
    expect(raw).toContain("Subject: Antrag");
    expect(raw).toContain('protocol="application/pkcs7-signature"');
    const read = await readSmime(raw, null);
    expect(read.encrypted).toBe(false);
    expect(read.text.trim()).toBe("Anbei der Antrag.");
    expect(read.signature).toMatchObject({ state: "valid", email: "jonas@weber.test" });
  });
});
