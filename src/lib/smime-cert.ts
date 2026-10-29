/**
 * Reading certificates of any key type from their DER (RFC 5280 §4.1) with node-forge's ASN.1
 * reader only: forge's own certificate parser knows RSA keys alone, while authorities and
 * signers more and more use EC. And checking an ECDSA signature (RFC 5753 for CMS, the value an
 * Ecdsa-Sig-Value of RFC 3279 §2.2.3) with WebCrypto, which wants it as r‖s (IEEE P1363).
 */
import type { asn1 as forgeAsn1 } from "node-forge";

type Forge = typeof import("node-forge");
type Asn1 = forgeAsn1.Asn1;

export type CertInfo = {
  emails: string[];
  fingerprint: string;
  issuer: string;
  notAfter: string;
  selfSigned: boolean;
};

const OID = {
  organization: "2.5.4.10",
  commonName: "2.5.4.3",
  email: "1.2.840.113549.1.9.1",
  subjectAltName: "2.5.29.17",
  ecPublicKey: "1.2.840.10045.2.1",
};

/** The curves WebCrypto knows, by the OID in the key's parameters (RFC 5480 §2.1.1.1). */
const CURVES: Record<string, { name: string; size: number }> = {
  "1.2.840.10045.3.1.7": { name: "P-256", size: 32 },
  "1.3.132.0.34": { name: "P-384", size: 48 },
  "1.3.132.0.35": { name: "P-521", size: 66 },
};

const parts = (node: Asn1) => node.value as Asn1[];

/** The TBSCertificate's fields, the optional version skipped. */
const tbsFields = (cert: Asn1) => {
  const fields = parts(parts(cert)[0]!);
  const at = fields[0]?.tagClass === 0x80 && fields[0]?.type === 0 ? 1 : 0;
  return {
    serial: fields[at]!,
    issuer: fields[at + 2]!,
    validity: fields[at + 3]!,
    subject: fields[at + 4]!,
    publicKey: fields[at + 5]!,
    extensions: fields.find((field) => field.tagClass === 0x80 && field.type === 3),
  };
};

/** The value of each attribute of a name with this OID, as text. */
const attribute = (forge: Forge, name: Asn1, oid: string): string[] =>
  parts(name).flatMap((set) =>
    parts(set).flatMap((pair) => {
      const [type, value] = parts(pair);
      if (!type || !value || forge.asn1.derToOid(type.value as string) !== oid) return [];
      const raw = value.value as string;
      return [value.type === forge.asn1.Type.UTF8 ? forge.util.decodeUtf8(raw) : raw];
    }),
  );

const sanEmails = (forge: Forge, extensions: Asn1 | undefined): string[] => {
  for (const ext of extensions ? parts(parts(extensions)[0]!) : []) {
    const fields = parts(ext);
    if (forge.asn1.derToOid(fields[0]!.value as string) !== OID.subjectAltName) continue;
    const names = forge.asn1.fromDer(fields.at(-1)!.value as string);
    return parts(names)
      .filter((general) => general.tagClass === 0x80 && general.type === 1)
      .map((general) => general.value as string);
  }
  return [];
};

const timeOf = (forge: Forge, node: Asn1) =>
  node.type === forge.asn1.Type.UTCTIME
    ? forge.asn1.utcTimeToDate(node.value as string)
    : forge.asn1.generalizedTimeToDate(node.value as string);

/** What Kontext shows of a certificate: addresses, fingerprint, issuer, end. */
export const describeAsn1 = (forge: Forge, cert: Asn1): CertInfo => {
  const fields = tbsFields(cert);
  const der = forge.asn1.toDer(cert).getBytes();
  const md = forge.md.sha256.create();
  md.update(der);
  const emails = [
    ...sanEmails(forge, fields.extensions),
    ...attribute(forge, fields.subject, OID.email),
  ].map((email) => email.toLowerCase());
  const issuerName = (oid: string) => attribute(forge, fields.issuer, oid)[0];
  const asDer = (node: Asn1) => forge.asn1.toDer(node).getBytes();
  return {
    emails: [...new Set(emails)],
    fingerprint: md.digest().toHex().toUpperCase(),
    issuer: issuerName(OID.organization) ?? issuerName(OID.commonName) ?? "",
    notAfter: timeOf(forge, parts(fields.validity)[1]!).toISOString(),
    selfSigned: asDer(fields.issuer) === asDer(fields.subject),
  };
};

/** The serial as hex without leading zeros, to find the signer of a SignerInfo. */
export const serialOf = (forge: Forge, cert: Asn1) =>
  forge.util
    .createBuffer(tbsFields(cert).serial.value as string)
    .toHex()
    .replace(/^0+/, "");

/** An EC certificate's key for WebCrypto: its SubjectPublicKeyInfo and curve; null otherwise. */
export const ecKeyOf = (forge: Forge, cert: Asn1) => {
  const spki = tbsFields(cert).publicKey;
  const [algorithm] = parts(parts(spki)[0]!).map((node) =>
    node.type === forge.asn1.Type.OID ? forge.asn1.derToOid(node.value as string) : "",
  );
  const parameter = parts(parts(spki)[0]!)[1];
  const curve =
    parameter?.type === forge.asn1.Type.OID
      ? CURVES[forge.asn1.derToOid(parameter.value as string)]
      : undefined;
  if (algorithm !== OID.ecPublicKey || !curve) return null;
  return { spki: binaryToBytes(forge.asn1.toDer(spki).getBytes()), curve };
};

const binaryToBytes = (binary: string) => Uint8Array.from(binary, (c) => c.charCodeAt(0));

/** Ecdsa-Sig-Value (SEQUENCE of r and s) → r‖s, each padded to the curve's size. */
export const rawEcdsaSignature = (forge: Forge, der: Uint8Array, size: number) => {
  let binary = "";
  for (const byte of der) binary += String.fromCharCode(byte);
  const [r, s] = parts(forge.asn1.fromDer(binary));
  const fixed = (node: Asn1 | undefined) => {
    const bytes = binaryToBytes((node?.value as string) ?? "").subarray(0);
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    const value = bytes.subarray(start);
    if (value.length > size) throw new Error("ECDSA: Wert zu lang");
    const out = new Uint8Array(size);
    out.set(value, size - value.length);
    return out;
  };
  const out = new Uint8Array(size * 2);
  out.set(fixed(r));
  out.set(fixed(s), size);
  return out;
};

/** An ECDSA signature over `data` by the key in `spki`, checked by WebCrypto. */
export const ecdsaVerifies = async (
  forge: Forge,
  key: { spki: Uint8Array; curve: { name: string; size: number } },
  hash: string,
  signature: Uint8Array,
  data: Uint8Array,
): Promise<boolean> => {
  const imported = await crypto.subtle.importKey(
    "spki",
    key.spki as Uint8Array<ArrayBuffer>,
    { name: "ECDSA", namedCurve: key.curve.name },
    false,
    ["verify"],
  );
  const raw = rawEcdsaSignature(forge, signature, key.curve.size);
  return crypto.subtle.verify(
    { name: "ECDSA", hash },
    imported,
    raw as Uint8Array<ArrayBuffer>,
    data as Uint8Array<ArrayBuffer>,
  );
};
