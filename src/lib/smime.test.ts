// @vitest-environment node
import { readFileSync } from "node:fs";
import forge from "node-forge";
import { beforeAll, describe, expect, it } from "vitest";
import { contentPart, withHeaders } from "./mime";
import {
  certInfo,
  envelopeEntity,
  type OwnSmime,
  openP12,
  readCertificate,
  readSmime,
  signEntity,
  signedOverEncrypted,
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

/** An entity signed with its content inside the signature (smime-type=signed-data). */
const opaqueSigned = (entity: string, own: OwnSmime) => {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(entity);
  p7.addCertificate(own.cert);
  p7.addSigner({
    key: own.key,
    certificate: own.cert,
    digestAlgorithm: forge.pki.oids.sha256!,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType!, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest! },
    ],
  });
  p7.sign();
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return [
    'Content-Type: application/pkcs7-mime; smime-type=signed-data; name="smime.p7m"',
    "Content-Transfer-Encoding: base64",
    "",
    btoa(der).replace(/.{76}/g, "$&\r\n"),
    "",
  ].join("\r\n");
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
    // RFC 8551 §3.2.2, RFC 5083: encrypted, though not to be opened here.
    expect(
      smimeKind('application/pkcs7-mime; smime-type=authEnveloped-data; name="smime.p7m"'),
    ).toBe("encrypted");
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

  it("refuses a signature whose RSA value was changed (checked by WebCrypto)", async () => {
    const raw = await smimeSignedMail({
      envelope,
      content: { text: "Betrag: 100 Euro", html: "<p>100</p>", attachments: [] },
      own: jonas,
      id: "t4",
    });
    const part = raw.match(
      /Content-Type: application\/pkcs7-signature[\s\S]*?\r?\n\r?\n([A-Za-z0-9+/=\r\n]+)/,
    );
    const base64 = part![1]!.trim();
    // The SignerInfo's last field is the RSA signature itself; one bit of it changes.
    const info = forge.asn1.fromDer(atob(base64.replace(/\s+/g, "")));
    const signedData = (info.value as forge.asn1.Asn1[])[1]!.value[0] as forge.asn1.Asn1;
    const signerInfos = (signedData.value as forge.asn1.Asn1[]).at(-1)!;
    const signerInfo = (signerInfos.value as forge.asn1.Asn1[])[0]!;
    const value = (signerInfo.value as forge.asn1.Asn1[]).at(-1)!;
    const bytes = value.value as string;
    value.value = `${bytes.slice(0, -1)}${String.fromCharCode(bytes.charCodeAt(bytes.length - 1) ^ 1)}`;
    const tampered = btoa(forge.asn1.toDer(info).getBytes()).replace(/.{76}/g, "$&\r\n");
    const changed = raw.replace(base64, tampered);
    expect((await readSmime(raw, null)).signature.state).toBe("valid");
    expect((await readSmime(changed, null)).signature.state).toBe("invalid");
  });

  // Made with OpenSSL 3 (`openssl smime -sign -md sha256|sha384`, self-signed P-256 and P-384
  // keys): ECDSA in CMS as other programs write it.
  const ecMail = (name: string) =>
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

  it("checks EC signatures on P-256 and P-384 (made with OpenSSL)", async () => {
    const p256 = await readSmime(ecMail("smime-ec-signed.eml"), null);
    expect(p256.text.trim()).toBe("EC-Unterschrift");
    expect(p256.signature).toMatchObject({ state: "valid", email: "ec@amt.test" });
    const p384 = await readSmime(ecMail("smime-ec384-signed.eml"), null);
    expect(p384.text.trim()).toBe("EC-384-Unterschrift");
    expect(p384.signature).toMatchObject({ state: "valid", email: "ec384@amt.test" });
    if (p384.signature.state === "valid") {
      expect(p384.signature.pem).toContain("-----BEGIN CERTIFICATE-----");
      expect((await certInfo(p384.signature.pem)).emails).toEqual(["ec384@amt.test"]);
    }
  });

  it("finds a changed text or a changed ECDSA value", async () => {
    const raw = ecMail("smime-ec384-signed.eml");
    const text = await readSmime(raw.replace("EC-384-Unterschrift", "EC-384-Unterschrifx"), null);
    expect(text.signature.state).toBe("invalid");
    // The last bytes of the signature: the s value of the Ecdsa-Sig-Value.
    const block = raw.match(/filename="smime\.p7s"\n\n([\s\S]+?)\n\n------/)![1]!;
    const der = forge.util.decode64(block.replace(/\s+/g, ""));
    const flipped = `${der.slice(0, -2)}${String.fromCharCode(der.charCodeAt(der.length - 2) ^ 1)}${der.slice(-1)}`;
    const changed = raw.replace(block, forge.util.encode64(flipped, 64));
    expect((await readSmime(changed, null)).signature.state).toBe("invalid");
  });

  it("reads a mail encrypted, then signed (RFC 8551 §3.7: either order)", async () => {
    const entity = contentPart(
      { text: "Hallo Amt", html: "<p>Hallo Amt</p>", attachments: [] },
      "x1",
    );
    const encrypted = await envelopeEntity(entity, [amtPem]);
    const raw = withHeaders(envelope, await signEntity(encrypted, jonas, "x1"));
    const read = await readSmime(raw, amt);
    expect(read.signature).toMatchObject({ state: "valid", email: "jonas@weber.test" });
    expect(read.encrypted).toBe(true);
    expect(read.text).toContain("Hallo Amt");
    // Without one's certificate the signature still shows, the content stays a file.
    const closed = await readSmime(raw, null);
    expect(closed.signature.state).toBe("valid");
    expect(closed.encrypted).toBe(false);
    // As JMAP shows it: the signed content, the first part, is the smime.p7m.
    const contentType = raw.match(/^Content-Type: (.*)$/m)![1]!;
    const tree = (first: { type: string; name: string | null }) => ({
      contentType,
      bodyStructure: {
        subParts: [first, { type: "application/pkcs7-signature", name: "smime.p7s" }],
      },
    });
    expect(signedOverEncrypted(tree({ type: "application/pkcs7-mime", name: "smime.p7m" }))).toBe(
      true,
    );
    expect(signedOverEncrypted(tree({ type: "application/pdf", name: "a.pdf" }))).toBe(false);
  });

  it("reads a mail encrypted, then signed with the content inside the signature", async () => {
    const entity = contentPart(
      { text: "Hallo Amt", html: "<p>Hallo Amt</p>", attachments: [] },
      "x2",
    );
    const raw = withHeaders(envelope, opaqueSigned(await envelopeEntity(entity, [amtPem]), jonas));
    const read = await readSmime(raw, amt);
    expect(read.signature).toMatchObject({ state: "valid", email: "jonas@weber.test" });
    expect(read.encrypted).toBe(true);
    expect(read.text).toContain("Hallo Amt");
  });

  it("cannot open AuthEnvelopedData (RFC 5083): says so instead of showing a file", async () => {
    const { asn1 } = forge;
    const info = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(
        asn1.Class.UNIVERSAL,
        asn1.Type.OID,
        false,
        asn1.oidToDer("1.2.840.113549.1.9.16.1.23").getBytes(),
      ),
      asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, []),
      ]),
    ]);
    const raw = withHeaders(
      envelope,
      [
        'Content-Type: application/pkcs7-mime; smime-type=authEnveloped-data; name="smime.p7m"',
        "Content-Transfer-Encoding: base64",
        "",
        btoa(asn1.toDer(info).getBytes()),
        "",
      ].join("\r\n"),
    );
    await expect(readSmime(raw, amt)).rejects.toThrow();
  });

  it("does not take a signed mail with a .p7m file for an encrypted one", async () => {
    // A CAdES-signed invoice, or an encrypted file forwarded without a note, under a signature.
    const entity = [
      'Content-Type: multipart/mixed; boundary="mix"',
      "",
      "--mix",
      'Content-Type: application/pkcs7-mime; name="rechnung.xml.p7m"',
      "Content-Transfer-Encoding: base64",
      'Content-Disposition: attachment; filename="rechnung.xml.p7m"',
      "",
      btoa("not really cms"),
      "--mix--",
      "",
    ].join("\r\n");
    const raw = withHeaders(envelope, await signEntity(entity, jonas, "r1"));
    const read = await readSmime(raw, amt);
    expect(read.signature.state).toBe("valid");
    expect(read.encrypted).toBe(false);
    expect(read.attachments.map((file) => file.name)).toEqual(["rechnung.xml.p7m"]);
    const contentType = raw.match(/^Content-Type: (.*)$/m)![1]!;
    const p7m = { type: "application/pkcs7-mime", name: "rechnung.xml.p7m" };
    const p7s = { type: "application/pkcs7-signature", name: "smime.p7s" };
    const mixed = { type: "multipart/mixed", name: null, subParts: [p7m] };
    expect(signedOverEncrypted({ contentType, bodyStructure: { subParts: [mixed, p7s] } })).toBe(
      false,
    );
    expect(signedOverEncrypted({ contentType, bodyStructure: { subParts: [p7m, p7s] } })).toBe(
      false,
    );
  });
});
