/**
 * S/MIME (RFC 8551) for mails to and from authorities and law firms (docs/encryption.md,
 * building block 4): one's certificate from a .p12 file, others' certificates, reading encrypted
 * and signed mails, sending encrypted and signed. node-forge does RSA encryption with PKCS#1 v1.5,
 * which the browser's own crypto lacks; signatures are checked here, as forge does not, and their
 * RSA part by the browser's WebCrypto: forge's own check takes forged signatures up to 1.4.0
 * (GHSA-86w9-cpqp-85rv). Loaded only when needed.
 */
import type { asn1 as forgeAsn1, pkcs7, pki, util } from "node-forge";
import {
  contentPart,
  type Envelope,
  type MimeAttachment,
  outerEnvelope,
  protectHeaders,
  withHeaders,
} from "./mime";

type Asn1 = forgeAsn1.Asn1;

const loadForge = async () => (await import("node-forge")).default;
const postal = async () => (await import("postal-mime")).default;

export type CertInfo = {
  emails: string[];
  fingerprint: string;
  issuer: string;
  notAfter: string;
  selfSigned: boolean;
};

export type SmimeKind = "encrypted" | "signed" | null;

/** S/MIME by its Content-Type: enveloped data, or a signature (detached or wrapped). */
export const smimeKind = (contentType: string | null | undefined): SmimeKind => {
  const type = (contentType ?? "").toLowerCase();
  const pkcs7 = /application\/(x-)?pkcs7-mime/.test(type);
  if (pkcs7 && /smime-type\s*=\s*"?enveloped-data/.test(type)) return "encrypted";
  if (pkcs7 && /smime-type\s*=\s*"?signed-data/.test(type)) return "signed";
  if (pkcs7 && !/smime-type/.test(type)) return "encrypted";
  if (type.includes("multipart/signed") && /pkcs7-signature/.test(type)) return "signed";
  return null;
};

const bytesToBinary = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return binary;
};
const binaryToBytes = (binary: string) => Uint8Array.from(binary, (c) => c.charCodeAt(0));

const describeCert = async (cert: pki.Certificate): Promise<CertInfo> => {
  const forge = await loadForge();
  const subjectEmail = cert.subject.getField("E")?.value as string | undefined;
  const san = cert.getExtension("subjectAltName") as
    | { altNames?: { type: number; value: string }[] }
    | undefined;
  const emails = [
    ...(san?.altNames ?? []).filter((name) => name.type === 1).map((name) => name.value),
    ...(subjectEmail ? [subjectEmail] : []),
  ].map((email) => email.toLowerCase());
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create();
  md.update(der);
  const issuer =
    (cert.issuer.getField("O")?.value as string | undefined) ??
    (cert.issuer.getField("CN")?.value as string | undefined) ??
    "";
  return {
    emails: [...new Set(emails)],
    fingerprint: md.digest().toHex().toUpperCase(),
    issuer,
    notAfter: cert.validity.notAfter.toISOString(),
    selfSigned: cert.isIssuer(cert),
  };
};

export const certToPem = async (cert: pki.Certificate) =>
  (await loadForge()).pki.certificateToPem(cert);

export const certFromPem = async (pem: string) => (await loadForge()).pki.certificateFromPem(pem);

/** A certificate file someone gives (.cer, .crt, .pem; DER or PEM). */
export const readCertificate = async (
  data: Uint8Array,
): Promise<{ pem: string; info: CertInfo }> => {
  const forge = await loadForge();
  const text = new TextDecoder().decode(data);
  const cert = text.includes("-----BEGIN CERTIFICATE-----")
    ? forge.pki.certificateFromPem(text)
    : forge.pki.certificateFromAsn1(forge.asn1.fromDer(bytesToBinary(data)));
  return { pem: forge.pki.certificateToPem(cert), info: await describeCert(cert) };
};

export const certInfo = async (pem: string) => describeCert(await certFromPem(pem));

const OIDS = {
  data: "1.2.840.113549.1.7.1",
  signedData: "1.2.840.113549.1.7.2",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  sha1: "1.3.14.3.2.26",
  sha256: "2.16.840.1.101.3.4.2.1",
  sha384: "2.16.840.1.101.3.4.2.2",
  signingTime: "1.2.840.113549.1.9.5",
  keyBag: "1.2.840.113549.1.12.10.1.1",
  shroudedKeyBag: "1.2.840.113549.1.12.10.1.2",
  certBag: "1.2.840.113549.1.12.10.1.3",
  aes256Cbc: "2.16.840.1.101.3.4.1.42",
  sha512: "2.16.840.1.101.3.4.2.3",
};

/** WebCrypto's names of the digests a signature may use, by OID. */
const WEB_HASHES: Record<string, string> = {
  [OIDS.sha1]: "SHA-1",
  [OIDS.sha256]: "SHA-256",
  [OIDS.sha384]: "SHA-384",
  [OIDS.sha512]: "SHA-512",
};

/**
 * An RSA signature (PKCS#1 v1.5, RFC 8017 §8.2) over `data` by the key in `spki`, checked by
 * WebCrypto, which hashes `data` itself and parses the signature strictly.
 */
const rsaVerifies = async (
  spki: Uint8Array<ArrayBuffer>,
  hash: string,
  signature: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
): Promise<boolean> => {
  const algorithm = { name: "RSASSA-PKCS1-v1_5", hash };
  const key = await crypto.subtle.importKey("spki", spki, algorithm, false, ["verify"]);
  return crypto.subtle.verify(algorithm, key, signature, data);
};

export type OwnSmime = { key: pki.rsa.PrivateKey; cert: pki.Certificate; info: CertInfo };

/** One's certificate and key from a .p12 file and its password; throws on a wrong password. */
export const openP12 = async (data: Uint8Array, password: string): Promise<OwnSmime> => {
  const forge = await loadForge();
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bytesToBinary(data)), password);
  const bags = (type: string) => p12.getBags({ bagType: type })[type] ?? [];
  const key = (bags(OIDS.shroudedKeyBag)[0] ?? bags(OIDS.keyBag)[0])?.key as
    | pki.rsa.PrivateKey
    | undefined;
  const certs = bags(OIDS.certBag)
    .map((bag) => bag.cert)
    .filter((cert): cert is pki.Certificate => Boolean(cert));
  // The certificate that belongs to the key.
  const cert = certs.find(
    (candidate) => key && (candidate.publicKey as pki.rsa.PublicKey).n.equals(key.n),
  );
  if (!key || !cert) throw new Error("Kein Schlüssel mit Zertifikat in der Datei");
  return { key, cert, info: await describeCert(cert) };
};

export type SmimeSignature =
  | {
      state: "valid";
      email: string;
      info: CertInfo;
      pem: string;
      /** The other certificates the signature brought (intermediates), for the trust check. */
      chain: string[];
    }
  | { state: "invalid" }
  | { state: "none" };

/**
 * Checks a CMS SignedData (RFC 5652) over `content`: the digest in its signed attributes, and the
 * signature over those attributes with the signer's certificate in it. Whether a known authority
 * issued the certificate is not judged here; its issuer is shown.
 */
export const checkSignedData = async (
  der: Uint8Array,
  detachedContent: Uint8Array | null,
): Promise<{ signature: SmimeSignature; content: Uint8Array | null }> => {
  const forge = await loadForge();
  const { asn1 } = forge;
  try {
    const info = asn1.fromDer(bytesToBinary(der));
    const signedData = (info.value as Asn1[])[1]!.value[0] as Asn1;
    const parts = signedData.value as Asn1[];
    const encap = parts[2]!.value as Asn1[];
    // Content wrapped inside (opaque signing): an OCTET STRING, possibly in pieces.
    const octets = (encap[1]?.value as Asn1[] | undefined)?.[0];
    const wrapped = octets
      ? binaryToBytes(
          Array.isArray(octets.value)
            ? (octets.value as Asn1[]).map((piece) => piece.value as string).join("")
            : (octets.value as string),
        )
      : null;
    const content = detachedContent ?? wrapped;
    if (!content) return { signature: { state: "none" }, content: null };
    const certsNode = parts.find(
      (part) => part.tagClass === asn1.Class.CONTEXT_SPECIFIC && part.type === 0,
    );
    // Every certificate as PEM; forge reads only those with RSA keys (an authority's may be EC).
    const brought = ((certsNode?.value as Asn1[]) ?? []).map((node) => {
      const pemText = forge.pem.encode({ type: "CERTIFICATE", body: asn1.toDer(node).getBytes() });
      try {
        return { pem: pemText, cert: forge.pki.certificateFromAsn1(node) };
      } catch {
        return { pem: pemText, cert: null };
      }
    });
    const certs = brought.flatMap((entry) => (entry.cert ? [entry.cert] : []));
    const signerInfo = (parts.at(-1)!.value as Asn1[])[0]!.value as Asn1[];
    const sid = signerInfo[1]!;
    const serial = forge.util.createBuffer((sid.value as Asn1[])[1]!.value as string).toHex();
    const signer =
      certs.find((cert) => cert.serialNumber.replace(/^0+/, "") === serial.replace(/^0+/, "")) ??
      certs[0];
    const digestOid = asn1.derToOid((signerInfo[2]!.value as Asn1[])[0]!.value as string);
    const md = () =>
      digestOid === OIDS.sha1
        ? forge.md.sha1.create()
        : digestOid === OIDS.sha384
          ? forge.md.sha384.create()
          : digestOid === OIDS.sha512
            ? forge.md.sha512.create()
            : forge.md.sha256.create();
    const attrs = signerInfo.find(
      (part) => part.tagClass === asn1.Class.CONTEXT_SPECIFIC && part.type === 0,
    );
    const signature = signerInfo.at(-1)!.value as string;
    if (!signer || !attrs) return { signature: { state: "invalid" }, content };
    // The digest of the content must be the one signed.
    const contentDigest = md();
    contentDigest.update(bytesToBinary(content));
    const signedDigest = (attrs.value as Asn1[])
      .map((attr) => attr.value as Asn1[])
      .find((attr) => asn1.derToOid(attr[0]!.value as string) === OIDS.messageDigest)?.[1]?.value as
      | Asn1[]
      | undefined;
    if (signedDigest?.[0]?.value !== contentDigest.digest().getBytes()) {
      return { signature: { state: "invalid" }, content };
    }
    // The signature is over the attributes, encoded as a SET.
    const set = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, attrs.value as Asn1[]);
    const ok = await rsaVerifies(
      binaryToBytes(asn1.toDer(forge.pki.publicKeyToAsn1(signer.publicKey)).getBytes()),
      WEB_HASHES[digestOid] ?? "SHA-256",
      binaryToBytes(signature),
      binaryToBytes(asn1.toDer(set).getBytes()),
    );
    if (!ok) return { signature: { state: "invalid" }, content };
    const described = await describeCert(signer);
    return {
      signature: {
        state: "valid",
        email: described.emails[0] ?? "",
        info: described,
        pem: forge.pki.certificateToPem(signer),
        chain: brought.filter((entry) => entry.cert !== signer).map((entry) => entry.pem),
      },
      content,
    };
  } catch {
    return { signature: { state: "invalid" }, content: detachedContent };
  }
};

/** Decrypts an EnvelopedData with one's key: the inner MIME entity. */
export const decryptEnveloped = async (der: Uint8Array, own: OwnSmime): Promise<Uint8Array> => {
  const forge = await loadForge();
  const message = forge.pkcs7.messageFromAsn1(
    forge.asn1.fromDer(bytesToBinary(der)),
  ) as pkcs7.PkcsEnvelopedData;
  const recipient = message.findRecipient(own.cert);
  if (!recipient) throw new Error("Nicht an dieses Zertifikat verschlüsselt");
  message.decrypt(recipient, own.key as unknown as pki.rsa.PrivateKey);
  return binaryToBytes((message.content as util.ByteStringBuffer).getBytes());
};

const base64Lines = (binary: string) => (btoa(binary).match(/.{1,76}/g) ?? []).join("\r\n");

/** A MIME entity signed (multipart/signed, detached, SHA-256). */
export const signEntity = async (entity: string, own: OwnSmime, id: string): Promise<string> => {
  const forge = await loadForge();
  const canonical = entity.replace(/\r?\n/g, "\r\n");
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(forge.util.encodeUtf8(canonical));
  p7.addCertificate(own.cert);
  p7.addSigner({
    key: own.key,
    certificate: own.cert,
    digestAlgorithm: OIDS.sha256,
    authenticatedAttributes: [
      { type: OIDS.contentType, value: OIDS.data },
      { type: OIDS.messageDigest },
      { type: OIDS.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign({ detached: true });
  const signature = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const boundary = `sig-${id}`;
  return [
    `Content-Type: multipart/signed; protocol="application/pkcs7-signature"; micalg=sha-256; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    canonical,
    `--${boundary}`,
    'Content-Type: application/pkcs7-signature; name="smime.p7s"',
    "Content-Transfer-Encoding: base64",
    'Content-Disposition: attachment; filename="smime.p7s"',
    "",
    base64Lines(signature),
    `--${boundary}--`,
    "",
  ].join("\r\n");
};

/** A MIME entity encrypted to these certificates (AES-256-CBC, RSA key transport). */
export const envelopeEntity = async (entity: string, certPems: string[]): Promise<string> => {
  const forge = await loadForge();
  const p7 = forge.pkcs7.createEnvelopedData();
  for (const pem of certPems) p7.addRecipient(forge.pki.certificateFromPem(pem));
  p7.content = forge.util.createBuffer(forge.util.encodeUtf8(entity));
  p7.encrypt(undefined, OIDS.aes256Cbc);
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return [
    'Content-Type: application/pkcs7-mime; smime-type=enveloped-data; name="smime.p7m"',
    "Content-Transfer-Encoding: base64",
    'Content-Disposition: attachment; filename="smime.p7m"',
    "",
    base64Lines(der),
    "",
  ].join("\r\n");
};

export type SmimeRead = {
  /** The real subject, from the protected headers inside; null when there are none. */
  subject: string | null;
  text: string;
  html: string | null;
  attachments: MimeAttachment[];
  signature: SmimeSignature;
  encrypted: boolean;
};

const bytesOf = (content: string | ArrayBuffer | Uint8Array) =>
  typeof content === "string" ? new TextEncoder().encode(content) : new Uint8Array(content);

/** The pkcs7 part of a mail: smime.p7m or smime.p7s, by type or name. */
const pkcs7Part = async (raw: string, kind: "mime" | "signature") => {
  const parsed = await (await postal()).parse(raw);
  const part = parsed.attachments.find(
    (file) =>
      new RegExp(`pkcs7-${kind}`, "i").test(file.mimeType) ||
      (file.filename ?? "").toLowerCase() === (kind === "mime" ? "smime.p7m" : "smime.p7s"),
  );
  return part ? bytesOf(part.content) : null;
};

/** The signed part of a multipart/signed entity, byte for byte (RFC 8551 §3.5.3). */
const signedPart = (raw: string, contentType: string) => {
  const boundary = contentType.match(/boundary\s*=\s*"?([^";]+)"?/i)?.[1];
  if (!boundary) return null;
  const text = raw.replace(/\r?\n/g, "\r\n");
  const start = text.indexOf(`--${boundary}\r\n`);
  if (start < 0) return null;
  const bodyStart = start + boundary.length + 4;
  const end = text.indexOf(`\r\n--${boundary}`, bodyStart);
  return end > 0 ? text.slice(bodyStart, end) : null;
};

const headerOf = (entity: string, name: string) => {
  const head = entity.replace(/\r?\n/g, "\r\n").split("\r\n\r\n")[0] ?? "";
  return (
    head
      .replace(/\r\n[ \t]+/g, " ")
      .split("\r\n")
      .find((line) => line.toLowerCase().startsWith(`${name.toLowerCase()}:`))
      ?.slice(name.length + 1)
      .trim() ?? ""
  );
};

const parsed = async (
  entity: string,
  signature: SmimeSignature,
  encrypted: boolean,
): Promise<SmimeRead> => {
  const inner = await (await postal()).parse(
    /^mime-version:/im.test(entity) ? entity : `MIME-Version: 1.0\r\n${entity}`,
  );
  return {
    subject: inner.subject ?? null,
    text: inner.text ?? "",
    html: inner.html ?? null,
    attachments: inner.attachments
      .filter((file) => !/pkcs7-signature/i.test(file.mimeType))
      .map((file) => ({
        name: file.filename ?? "Anhang",
        type: file.mimeType,
        bytes: bytesOf(file.content),
      })),
    signature,
    encrypted,
  };
};

/**
 * Reads an S/MIME mail (its whole raw text): decrypted with one's certificate where it is
 * encrypted, the signature checked where it is signed, either order.
 */
export const readSmime = async (
  raw: string,
  own: OwnSmime | null,
  depth = 0,
): Promise<SmimeRead> => {
  const contentType = headerOf(raw, "Content-Type");
  const kind = smimeKind(contentType);
  const decoder = new TextDecoder();
  if (kind === "encrypted") {
    if (!own) throw new Error("Kein eigenes Zertifikat");
    const der = await pkcs7Part(raw, "mime");
    if (!der) throw new Error("Kein verschlüsselter Inhalt");
    const inner = decoder.decode(await decryptEnveloped(der, own));
    if (depth < 2 && smimeKind(headerOf(inner, "Content-Type"))) {
      return { ...(await readSmime(inner, own, depth + 1)), encrypted: true };
    }
    return parsed(inner, { state: "none" }, true);
  }
  if (kind === "signed" && /multipart\/signed/i.test(contentType)) {
    const signed = signedPart(raw, contentType);
    const der = await pkcs7Part(raw, "signature");
    if (!signed || !der) return parsed(raw, { state: "invalid" }, false);
    const { signature } = await checkSignedData(der, new TextEncoder().encode(signed));
    return parsed(signed, signature, false);
  }
  if (kind === "signed") {
    const der = await pkcs7Part(raw, "mime");
    const result = der ? await checkSignedData(der, null) : null;
    if (!result?.content) return parsed(raw, { state: "invalid" }, false);
    return parsed(decoder.decode(result.content), result.signature, false);
  }
  return parsed(raw, { state: "none" }, false);
};

/**
 * A mail signed with one's certificate and encrypted to the recipients' and one's own (so the
 * copy in Sent stays readable): the raw text to send.
 */
export const smimeMail = async ({
  envelope,
  content,
  recipientCerts,
  own,
  id,
}: {
  envelope: Envelope;
  content: { text: string; html: string; attachments: MimeAttachment[] };
  recipientCerts: string[];
  own: OwnSmime;
  id: string;
}): Promise<string> => {
  const signed = await signEntity(protectHeaders(contentPart(content, id), envelope), own, id);
  const ownPem = await certToPem(own.cert);
  return withHeaders(
    outerEnvelope(envelope),
    await envelopeEntity(signed, [...recipientCerts, ownPem]),
  );
};

/** A mail signed with one's certificate and not encrypted: the raw text to send. */
export const smimeSignedMail = async ({
  envelope,
  content,
  own,
  id,
}: {
  envelope: Envelope;
  content: { text: string; html: string; attachments: MimeAttachment[] };
  own: OwnSmime;
  id: string;
}): Promise<string> => withHeaders(envelope, await signEntity(contentPart(content, id), own, id));

export { binaryToBytes, bytesToBinary };
