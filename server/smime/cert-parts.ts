/**
 * The parts of an X.509 certificate (RFC 5280 §4.1) the trust check reads with their exact bytes:
 * the TBSCertificate's fields, extensions, the purposes it is meant for. Pure.
 */
import type { X509Certificate } from "node:crypto";
import { children, inner, oidOf, read } from "./der";

export const OID = {
  extKeyUsage: "2.5.29.37",
  anyKeyUsage: "2.5.29.37.0",
  emailProtection: "1.3.6.1.5.5.7.3.4",
  ocspSigning: "1.3.6.1.5.5.7.3.9",
  infoAccess: "1.3.6.1.5.5.7.1.1",
  ocsp: "1.3.6.1.5.5.7.48.1",
  ocspBasic: "1.3.6.1.5.5.7.48.1.1",
  sha1: "1.3.14.3.2.26",
  crlDistributionPoints: "2.5.29.31",
};

/** The hash of a signature algorithm, as node:crypto names it. */
export const HASHES: Record<string, string> = {
  "1.2.840.113549.1.1.5": "sha1",
  "1.2.840.113549.1.1.11": "sha256",
  "1.2.840.113549.1.1.12": "sha384",
  "1.2.840.113549.1.1.13": "sha512",
  "1.2.840.10045.4.3.2": "sha256",
  "1.2.840.10045.4.3.3": "sha384",
  "1.2.840.10045.4.3.4": "sha512",
};

/** The parts of a certificate's TBSCertificate, the optional version skipped. */
export const tbsOf = (cert: X509Certificate) => {
  const der = new Uint8Array(cert.raw);
  const tbs = children(read(der))[0]!;
  const fields = children(tbs);
  const offset = fields[0]?.tag === 0xa0 ? 1 : 0;
  return {
    serial: fields[offset]!,
    issuer: fields[offset + 2]!,
    subject: fields[offset + 4]!,
    publicKey: fields[offset + 5]!,
    extensions: fields.find((field) => field.tag === 0xa3),
  };
};

/** An extension's value (inside its OCTET STRING), or undefined. */
export const extension = (cert: X509Certificate, oid: string) => {
  const list = tbsOf(cert).extensions;
  if (!list) return undefined;
  for (const ext of children(inner(list))) {
    const parts = children(ext);
    if (oidOf(parts[0]!) === oid) return inner(parts.at(-1)!);
  }
  return undefined;
};

export const purposes = (cert: X509Certificate) => {
  const value = extension(cert, OID.extKeyUsage);
  return value ? children(value).map(oidOf) : null;
};

/** Meant for mail: no limit on its use, or e-mail protection among them. */
export const forMail = (cert: X509Certificate) => {
  const list = purposes(cert);
  return !list || list.includes(OID.emailProtection) || list.includes(OID.anyKeyUsage);
};
