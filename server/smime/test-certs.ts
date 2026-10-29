/**
 * Certificates and revocation lists for the S/MIME tests, built from DER (RFC 5280 §4.1, §5.1) and
 * signed with node:crypto: RSA, or ECDSA on P-256 / P-384 (signature algorithms of RFC 5758 §3.2,
 * the value an Ecdsa-Sig-Value, RFC 3279 §2.2.3). node-forge only makes RSA ones. Tests only.
 */
import { generateKeyPairSync, type KeyObject, sign, X509Certificate } from "node:crypto";
import { encode, encodeOid, TAG } from "./der";

export type KeyKind = "rsa" | "p256" | "p384";
export type Made = {
  x509: X509Certificate;
  pem: string;
  der: Uint8Array;
  key: KeyObject;
  kind: KeyKind;
  name: Uint8Array;
};

const utf8 = (text: string) => new TextEncoder().encode(text);
const DAY = 86_400_000;

const integer = (hex: string) => {
  const bytes = Buffer.from(hex.length % 2 ? `0${hex}` : hex, "hex");
  return encode(TAG.INTEGER, bytes[0]! & 0x80 ? Buffer.concat([Buffer.of(0), bytes]) : bytes);
};

/** UTCTime, as RFC 5280 §4.1.2.5.1 wants for dates before 2050. */
export const utcTime = (date: Date) => {
  const digits = date
    .toISOString()
    .replace(/[-:T]|\.\d+/g, "")
    .slice(2, 14);
  return encode(0x17, utf8(`${digits}Z`));
};

const name = (organization: string) =>
  encode(
    TAG.SEQUENCE,
    encode(0x31, encode(TAG.SEQUENCE, encodeOid("2.5.4.10"), encode(0x0c, utf8(organization)))),
  );

const algorithm = (kind: KeyKind) =>
  kind === "rsa"
    ? encode(TAG.SEQUENCE, encodeOid("1.2.840.113549.1.1.11"), encode(TAG.NULL))
    : encode(
        TAG.SEQUENCE,
        encodeOid(kind === "p384" ? "1.2.840.10045.4.3.3" : "1.2.840.10045.4.3.2"),
      );

export const hashOf = (kind: KeyKind) => (kind === "p384" ? "sha384" : "sha256");

export const newKey = (kind: KeyKind) =>
  kind === "rsa"
    ? generateKeyPairSync("rsa", { modulusLength: 1024 })
    : generateKeyPairSync("ec", { namedCurve: kind === "p384" ? "P-384" : "P-256" });

/** `tbs` signed: SEQUENCE { tbs, algorithm, BIT STRING signature }. */
const signed = (tbs: Uint8Array, key: KeyObject, kind: KeyKind) => {
  const signature = sign(hashOf(kind), tbs, { key, dsaEncoding: "der" });
  return encode(
    TAG.SEQUENCE,
    tbs,
    algorithm(kind),
    encode(TAG.BIT_STRING, Buffer.of(0), signature),
  );
};

const ext = (oid: string, value: Uint8Array) =>
  encode(TAG.SEQUENCE, encodeOid(oid), encode(TAG.OCTET_STRING, value));

/** CRL Distribution Points with one full name per address (§4.2.1.13). */
export const crlPoints = (urls: string[]) =>
  ext(
    "2.5.29.31",
    encode(
      TAG.SEQUENCE,
      ...urls.map((url) =>
        encode(TAG.SEQUENCE, encode(0xa0, encode(0xa0, encode(0x86, utf8(url))))),
      ),
    ),
  );

export const makeCert = ({
  organization,
  serial,
  issuer = null,
  kind = "rsa",
  ca = false,
  email,
  crl = [],
  now = new Date(),
  days = 365,
}: {
  organization: string;
  serial: string;
  issuer?: Made | null;
  kind?: KeyKind;
  ca?: boolean;
  email?: string;
  crl?: string[];
  now?: Date;
  days?: number;
}): Made => {
  const keys = newKey(kind);
  const own = name(organization);
  const extensions = [
    ext("2.5.29.19", encode(TAG.SEQUENCE, ...(ca ? [encode(0x01, Buffer.of(0xff))] : []))),
    ...(ca ? [] : [ext("2.5.29.37", encode(TAG.SEQUENCE, encodeOid("1.3.6.1.5.5.7.3.4")))]),
    ...(email ? [ext("2.5.29.17", encode(TAG.SEQUENCE, encode(0x81, utf8(email))))] : []),
    ...(crl.length ? [crlPoints(crl)] : []),
  ];
  const signer = issuer ?? { key: keys.privateKey, kind, name: own };
  const tbs = encode(
    TAG.SEQUENCE,
    encode(0xa0, integer("02")),
    integer(serial),
    algorithm(signer.kind),
    signer.name,
    encode(
      TAG.SEQUENCE,
      utcTime(new Date(now.getTime() - DAY)),
      utcTime(new Date(now.getTime() + days * DAY)),
    ),
    own,
    keys.publicKey.export({ type: "spki", format: "der" }),
    encode(0xa3, encode(TAG.SEQUENCE, ...extensions)),
  );
  const der = signed(tbs, signer.key, signer.kind);
  const x509 = new X509Certificate(der);
  return { x509, pem: x509.toString(), der, key: keys.privateKey, kind, name: own };
};

/** A CertificateList by `issuer` naming `revoked` serials; `extensions` go in [0] as given. */
export const makeCrl = ({
  issuer,
  revoked = [],
  thisUpdate,
  nextUpdate,
  extensions = [],
  signer = issuer,
}: {
  issuer: Made;
  revoked?: string[];
  thisUpdate: Date;
  nextUpdate?: Date;
  extensions?: Uint8Array[];
  signer?: Made;
}): Uint8Array => {
  const entries = revoked.map((serial) =>
    encode(TAG.SEQUENCE, integer(serial), utcTime(thisUpdate)),
  );
  const tbs = encode(
    TAG.SEQUENCE,
    integer("01"),
    algorithm(signer.kind),
    issuer.name,
    utcTime(thisUpdate),
    ...(nextUpdate ? [utcTime(nextUpdate)] : []),
    ...(entries.length ? [encode(TAG.SEQUENCE, ...entries)] : []),
    ...(extensions.length ? [encode(0xa0, encode(TAG.SEQUENCE, ...extensions))] : []),
  );
  return signed(tbs, signer.key, signer.kind);
};

export const crlExtension = (oid: string, value: Uint8Array, critical = false) =>
  encode(
    TAG.SEQUENCE,
    encodeOid(oid),
    ...(critical ? [encode(0x01, Buffer.of(0xff))] : []),
    encode(TAG.OCTET_STRING, value),
  );

export { DAY };
