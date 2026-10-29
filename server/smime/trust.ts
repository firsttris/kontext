/**
 * Whether an S/MIME certificate can be trusted (docs/encryption.md, building block 4): a chain
 * up to an authority one trusts – those that come with Bun/Node (Mozilla's list), the company's
 * own (`SMIME_ROOTS`) and those the Firmenverwaltung added (authorities.ts) –, valid now, meant
 * for mail, and not revoked (OCSP, the answer's signature checked; else the revocation lists,
 * crl.ts). And certificates others publish in DNS (SMIMEA, RFC 8162, signed with
 * DNSSEC). The server does this, as the browser may not ask other sites.
 */
import { createHash, verify, X509Certificate } from "node:crypto";
import { extension, forMail, HASHES, OID, purposes, tbsOf } from "./cert-parts";
import { children, content, encode, encodeOid, inner, oidOf, read, TAG, whole } from "./der";

export type ChainState = "trusted" | "untrusted" | "expired" | "not-for-mail";
export type Revocation = "good" | "revoked" | "unknown";
export type Trust = { chain: ChainState; revocation: Revocation; root: string | null };

/** "O=…" or "CN=…" of a name as node:crypto writes it. */
export const nameOf = (distinguished: string) => {
  const lines = distinguished.split("\n");
  const value = (key: string) =>
    lines.find((line) => line.startsWith(`${key}=`))?.slice(key.length + 1);
  return value("O") ?? value("CN") ?? distinguished;
};

const valid = (cert: X509Certificate, now: Date) =>
  new Date(cert.validFrom) <= now && now <= new Date(cert.validTo);

const issued = (child: X509Certificate, parent: X509Certificate) => {
  try {
    return child.checkIssued(parent) && child.verify(parent.publicKey);
  } catch {
    return false;
  }
};

export const parseCert = (pem: string): X509Certificate | null => {
  try {
    return new X509Certificate(pem);
  } catch {
    return null;
  }
};

/**
 * The chain from the certificate up to a trusted authority, with the certificates that came along
 * (a signed mail carries its intermediates); the issuer of each found in turn.
 */
export const buildChain = (
  leaf: X509Certificate,
  along: X509Certificate[],
  roots: X509Certificate[],
  now: Date,
): { state: ChainState; chain: X509Certificate[]; root: X509Certificate | null } => {
  if (!forMail(leaf)) return { state: "not-for-mail", chain: [leaf], root: null };
  const chain = [leaf];
  let current = leaf;
  for (let depth = 0; depth < 8; depth++) {
    const root = roots.find((candidate) => issued(current, candidate));
    if (root) {
      const all = [...chain, root];
      return {
        state: all.every((cert) => valid(cert, now)) ? "trusted" : "expired",
        chain: all,
        root,
      };
    }
    const next = along.find(
      (candidate) => candidate.ca && !chain.includes(candidate) && issued(current, candidate),
    );
    if (!next) break;
    chain.push(next);
    current = next;
  }
  return { state: valid(leaf, now) ? "untrusted" : "expired", chain, root: null };
};

/** Where to ask whether the certificate was revoked (its AIA extension), http or https. */
export const ocspUrl = (cert: X509Certificate): string | null => {
  const value = extension(cert, OID.infoAccess);
  if (!value) return null;
  for (const description of children(value)) {
    const [method, location] = children(description);
    if (method && location && oidOf(method) === OID.ocsp && location.tag === 0x86) {
      const url = new TextDecoder().decode(content(location));
      if (/^https?:\/\//.test(url)) return url;
    }
  }
  return null;
};

const sha1 = (bytes: Uint8Array) => new Uint8Array(createHash("sha1").update(bytes).digest());

/** CertID (RFC 6960 §4.1.1): which certificate, by its issuer's name and key and its serial. */
const certId = (cert: X509Certificate, issuer: X509Certificate) => {
  const own = tbsOf(cert);
  const theirs = tbsOf(issuer);
  // The key's bits, without the "unused bits" byte of the BIT STRING.
  const keyBits = content(children(theirs.publicKey)[1]!).subarray(1);
  return encode(
    TAG.SEQUENCE,
    encode(TAG.SEQUENCE, encodeOid(OID.sha1), encode(TAG.NULL)),
    encode(TAG.OCTET_STRING, sha1(whole(theirs.subject))),
    encode(TAG.OCTET_STRING, sha1(keyBits)),
    whole(own.serial),
  );
};

export const ocspRequest = (cert: X509Certificate, issuer: X509Certificate): Uint8Array =>
  encode(
    TAG.SEQUENCE,
    encode(TAG.SEQUENCE, encode(TAG.SEQUENCE, encode(TAG.SEQUENCE, certId(cert, issuer)))),
  );

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

/**
 * What an OCSP answer says of the certificate: only when it is signed by its issuer, or by a
 * responder the issuer named for this (RFC 6960 §4.2.2.2), and still current.
 */
export const readOcspResponse = (
  response: Uint8Array,
  cert: X509Certificate,
  issuer: X509Certificate,
  now: Date,
): Revocation => {
  try {
    const [status, bytes] = children(read(response));
    if (!status || content(status)[0] !== 0 || !bytes) return "unknown";
    const [type, octets] = children(inner(bytes));
    if (!type || oidOf(type) !== OID.ocspBasic || !octets) return "unknown";
    const basic = children(inner(octets));
    const [tbs, algorithm, signature, certsField] = basic;
    if (!tbs || !algorithm || !signature) return "unknown";
    const hash = HASHES[oidOf(children(algorithm)[0]!)];
    if (!hash) return "unknown";
    const included = certsField
      ? children(inner(certsField)).flatMap((node) => {
          try {
            return [new X509Certificate(whole(node))];
          } catch {
            return [];
          }
        })
      : [];
    const signers = [
      issuer,
      ...included.filter(
        (candidate) =>
          issued(candidate, issuer) && (purposes(candidate) ?? []).includes(OID.ocspSigning),
      ),
    ];
    const bits = content(signature).subarray(1);
    const signedBy = signers.some((signer) => {
      try {
        return verify(hash, whole(tbs), signer.publicKey, bits);
      } catch {
        return false;
      }
    });
    if (!signedBy) return "unknown";
    const fields = children(tbs);
    const responses = fields.find(
      (field, index) => index > 0 && field.tag === TAG.SEQUENCE && children(field).length > 0,
    );
    const ownSerial = content(tbsOf(cert).serial);
    for (const single of responses ? children(responses) : []) {
      const [id, state, , next] = children(single);
      const serial = id && children(id)[3];
      if (!serial || !sameBytes(content(serial), ownSerial)) continue;
      if (next?.tag === 0xa0) {
        const until = new TextDecoder().decode(content(inner(next)));
        const at = new Date(
          until.replace(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d).*$/, "$1-$2-$3T$4:$5:$6Z"),
        );
        if (at < now) return "unknown";
      }
      if (state?.tag === 0x80) return "good";
      if (state?.tag === 0xa1) return "revoked";
      return "unknown";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
};

export type TrustDeps = {
  roots: X509Certificate[];
  /** Posts an OCSP request; tests give a stand-in. */
  post: (url: string, body: Uint8Array) => Promise<Uint8Array | null>;
  /** Revocation by the certificate's lists, where OCSP says nothing (crl.ts). */
  crl?: (cert: X509Certificate, issuer: X509Certificate) => Promise<Revocation>;
  now?: () => Date;
};

export const checkTrust = async (
  { certificate, chain }: { certificate: string; chain: string[] },
  { roots, post, crl, now = () => new Date() }: TrustDeps,
): Promise<Trust | null> => {
  const leaf = parseCert(certificate);
  if (!leaf) return null;
  const at = now();
  const along = chain.map(parseCert).filter((cert): cert is X509Certificate => cert !== null);
  const built = buildChain(leaf, along, roots, at);
  const root = built.root ? nameOf(built.root.subject) : null;
  const issuer = built.chain[1];
  if (built.state !== "trusted" || !issuer) {
    return { chain: built.state, revocation: "unknown", root };
  }
  const url = ocspUrl(leaf);
  const answer = url ? await post(url, ocspRequest(leaf, issuer)).catch(() => null) : null;
  const ocsp = answer ? readOcspResponse(answer, leaf, issuer, at) : "unknown";
  const revocation =
    ocsp === "unknown" && crl ? await crl(leaf, issuer).catch(() => "unknown" as const) : ocsp;
  return { chain: built.state, revocation, root };
};

/** Where SMIMEA records of an address are (RFC 8162 §3): the local part hashed, then the domain. */
export const smimeaName = (email: string) => {
  const at = email.lastIndexOf("@");
  const local = email.slice(0, at);
  const hash = createHash("sha256").update(local, "utf8").digest("hex").slice(0, 56);
  return `${hash}._smimecert.${email.slice(at + 1)}`;
};

/**
 * The full certificate in an SMIMEA record ("3 0 0 <hex>": the certificate itself, for the end
 * entity); hashes only (selector or matching type not 0) cannot be used to encrypt.
 */
export const certFromSmimea = (data: string): string | null => {
  const generic = data.match(/^\\#\s+\d+\s+([0-9a-f\s]+)$/i);
  const hex = generic ? generic[1]!.replace(/\s+/g, "") : null;
  let usage: number;
  let selector: number;
  let type: number;
  let cert: string;
  if (hex) {
    [usage, selector, type] = [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as [
      number,
      number,
      number,
    ];
    cert = hex.slice(6);
  } else {
    const parts = data.trim().split(/\s+/);
    [usage, selector, type] = parts.slice(0, 3).map(Number) as [number, number, number];
    cert = parts.slice(3).join("");
  }
  if (![1, 3].includes(usage) || selector !== 0 || type !== 0 || !/^[0-9a-f]+$/i.test(cert)) {
    return null;
  }
  const der = Buffer.from(cert, "hex");
  const parsed = parseCert(
    `-----BEGIN CERTIFICATE-----\n${der
      .toString("base64")
      .match(/.{1,64}/g)!
      .join("\n")}\n-----END CERTIFICATE-----`,
  );
  return parsed ? parsed.toString() : null;
};
