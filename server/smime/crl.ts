/**
 * Revocation by certificate revocation list (CRL, RFC 5280 §5), for authorities without OCSP:
 * where the certificate names its lists (CRL Distribution Points, §4.2.1.13), reading a list with
 * its signature checked against the issuer, and a cache per list until its next update.
 */
import { verify, type X509Certificate } from "node:crypto";
import { extension, HASHES, OID, tbsOf } from "./cert-parts";
import { children, content, inner, type Node, oidOf, read, TAG, whole } from "./der";
import type { Revocation } from "./trust";

const TIME = { UTC: 0x17, GENERALIZED: 0x18 };
const EXT = {
  deltaCrlIndicator: "2.5.29.27",
  issuingDistributionPoint: "2.5.29.28",
};

/**
 * The http(s) addresses of the certificate's lists: full names of distribution points without
 * `reasons` or `cRLIssuer` (a partial or indirect list would not say all). LDAP addresses are
 * left out (docs/encryption.md).
 */
export const crlUrls = (cert: X509Certificate): string[] => {
  const value = extension(cert, OID.crlDistributionPoints);
  if (!value) return [];
  const urls: string[] = [];
  for (const point of children(value)) {
    const fields = children(point);
    // reasons [1], cRLIssuer [2]
    if (fields.some((field) => field.tag === 0xa1 || field.tag === 0xa2 || field.tag === 0x81)) {
      continue;
    }
    const name = fields.find((field) => field.tag === 0xa0);
    const full = name && children(name).find((choice) => choice.tag === 0xa0);
    for (const general of full ? children(full) : []) {
      if (general.tag !== 0x86) continue;
      const url = new TextDecoder().decode(content(general));
      if (/^https?:\/\//i.test(url)) urls.push(url);
    }
  }
  return urls;
};

/** UTCTime or GeneralizedTime (RFC 5280 §4.1.2.5), in UTC. */
export const timeOf = (node: Node): Date | null => {
  const text = new TextDecoder().decode(content(node));
  const full =
    node.tag === TIME.UTC ? `${Number(text.slice(0, 2)) >= 50 ? "19" : "20"}${text}` : text;
  const match = full.match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(?:\.\d+)?Z$/);
  return match
    ? new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`)
    : null;
};

const isTime = (node: Node | undefined) => node?.tag === TIME.UTC || node?.tag === TIME.GENERALIZED;

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

/** Serials without leading zero bytes, as hex: how the list and the certificate are compared. */
const serialKey = (bytes: Uint8Array) =>
  Buffer.from(bytes)
    .toString("hex")
    .replace(/^(00)+(?=..)/, "");

/**
 * Whether the list's own extensions leave it usable: no delta list, and an issuing distribution
 * point (§5.2.5) only for user certificates at most; any other critical extension is not
 * understood, and such a list must not be used (§5.2).
 */
const usableExtensions = (field: Node | undefined) => {
  if (!field) return true;
  for (const ext of children(inner(field))) {
    const parts = children(ext);
    const oid = oidOf(parts[0]!);
    if (oid === EXT.deltaCrlIndicator) return false;
    if (oid === EXT.issuingDistributionPoint) {
      const flags = children(inner(parts.at(-1)!));
      // onlyContainsCACerts [2], onlySomeReasons [3], indirectCRL [4], onlyAttributeCerts [5]
      if (flags.some((flag) => [0x82, 0xa3, 0x83, 0x84, 0x85].includes(flag.tag))) return false;
      continue;
    }
    const critical = parts.length === 3 && parts[1]!.tag === 0x01 && content(parts[1]!)[0] !== 0;
    if (critical) return false;
  }
  return true;
};

export type Crl = { revoked: Set<string>; nextUpdate: Date };

/**
 * A CertificateList (§5.1) when it is the issuer's: its name, signed with its key, current at
 * `now` (a list without nextUpdate or past it says nothing); null otherwise.
 */
export const readCrl = (bytes: Uint8Array, issuer: X509Certificate, now: Date): Crl | null => {
  try {
    const [tbs, algorithm, signature] = children(read(bytes));
    if (!tbs || !algorithm || signature?.tag !== TAG.BIT_STRING) return null;
    const hash = HASHES[oidOf(children(algorithm)[0]!)];
    if (!hash) return null;
    const bits = content(signature).subarray(1);
    if (!verify(hash, whole(tbs), issuer.publicKey, bits)) return null;
    const fields = children(tbs);
    const at = fields[0]?.tag === TAG.INTEGER ? 1 : 0;
    const name = fields[at + 1];
    if (!name || !sameBytes(whole(name), whole(tbsOf(issuer).subject))) return null;
    const thisUpdate = fields[at + 2] && timeOf(fields[at + 2]!);
    const next = isTime(fields[at + 3]) ? timeOf(fields[at + 3]!) : null;
    if (!thisUpdate || !next || thisUpdate > now || next < now) return null;
    const rest = fields.slice(at + (isTime(fields[at + 3]) ? 4 : 3));
    const list = rest.find((field) => field.tag === TAG.SEQUENCE);
    if (!usableExtensions(rest.find((field) => field.tag === 0xa0))) return null;
    const revoked = new Set(
      (list ? children(list) : []).map((entry) => serialKey(content(children(entry)[0]!))),
    );
    return { revoked, nextUpdate: next };
  } catch {
    return null;
  }
};

export const revokedIn = (crl: Crl, cert: X509Certificate): Revocation =>
  crl.revoked.has(serialKey(content(tbsOf(cert).serial))) ? "revoked" : "good";

export type CrlDeps = {
  /** Fetches a list (size and time limited, public hosts only); tests give a stand-in. */
  get: (url: string) => Promise<Uint8Array | null>;
  now?: () => Date;
  /** The longest a list is kept, even if it says it is good for longer. */
  maxAgeMs?: number;
  /** After a failed fetch: when to try that address again. */
  retryMs?: number;
  /** How many lists are kept at most. */
  maxLists?: number;
};

type Cached = { until: number; crl: Crl | null; issuer: string };

/**
 * Revocation by the certificate's lists, each fetched once and kept until its next update (at
 * most `maxAgeMs`); a list that could not be had is asked again after `retryMs`. Requests for the
 * same list at the same time share one fetch.
 */
export const createCrlCheck = ({
  get,
  now = () => new Date(),
  maxAgeMs = 24 * 60 * 60_000,
  retryMs = 10 * 60_000,
  maxLists = 100,
}: CrlDeps) => {
  const lists = new Map<string, Cached>();
  const pending = new Map<string, Promise<Cached>>();

  const load = async (url: string, issuer: X509Certificate): Promise<Cached> => {
    const at = now();
    const bytes = await get(url).catch(() => null);
    const crl = bytes ? readCrl(bytes, issuer, at) : null;
    const until = crl
      ? Math.min(crl.nextUpdate.getTime(), at.getTime() + maxAgeMs)
      : at.getTime() + retryMs;
    const cached = { until, crl, issuer: issuer.fingerprint256 };
    if (lists.size >= maxLists) lists.delete(lists.keys().next().value!);
    lists.set(url, cached);
    return cached;
  };

  const listAt = (url: string, issuer: X509Certificate) => {
    const kept = lists.get(url);
    if (kept && kept.until > now().getTime() && kept.issuer === issuer.fingerprint256) {
      return Promise.resolve(kept);
    }
    const running = pending.get(url);
    if (running) return running;
    const loading = load(url, issuer).finally(() => pending.delete(url));
    pending.set(url, loading);
    return loading;
  };

  return async (cert: X509Certificate, issuer: X509Certificate): Promise<Revocation> => {
    for (const url of crlUrls(cert)) {
      const { crl } = await listAt(url, issuer);
      if (crl) return revokedIn(crl, cert);
    }
    return "unknown";
  };
};
