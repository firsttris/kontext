// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createCrlCheck, crlUrls, readCrl, revokedIn } from "./crl";
import { encode, TAG } from "./der";
import { crlExtension, DAY, makeCert, makeCrl } from "./test-certs";
import { checkTrust } from "./trust";

const now = new Date("2026-10-25T10:00:00Z");
const URL_A = "http://crl.stelle.test/stelle.crl";
const root = makeCert({ organization: "Stelle", serial: "01", ca: true, now });
const other = makeCert({ organization: "Andere Stelle", serial: "05", ca: true, now });
const leaf = makeCert({
  organization: "Amt",
  serial: "0a0b",
  issuer: root,
  email: "amt@stadt.test",
  crl: [URL_A, "ldap://ldap.stelle.test/cn=Stelle?certificateRevocationList"],
  now,
});
const yesterday = new Date(now.getTime() - DAY);
const tomorrow = new Date(now.getTime() + DAY);

describe("crlUrls", () => {
  it("takes the http addresses of the distribution points, not LDAP", () => {
    expect(crlUrls(leaf.x509)).toEqual([URL_A]);
    expect(crlUrls(root.x509)).toEqual([]);
  });
});

describe("readCrl", () => {
  const crl = (options: Partial<Parameters<typeof makeCrl>[0]> = {}) =>
    makeCrl({ issuer: root, thisUpdate: yesterday, nextUpdate: tomorrow, ...options });

  it("finds a revoked serial, and none in a list without it", () => {
    const revoked = readCrl(crl({ revoked: ["7f", "0a0b"] }), root.x509, now);
    expect(revoked && revokedIn(revoked, leaf.x509)).toBe("revoked");
    const clean = readCrl(crl({ revoked: ["7f"] }), root.x509, now);
    expect(clean && revokedIn(clean, leaf.x509)).toBe("good");
    expect(readCrl(crl(), root.x509, now)?.revoked.size).toBe(0);
  });

  it("takes a list only from its issuer, signed with its key, still current", () => {
    expect(readCrl(crl({ signer: other }), root.x509, now)).toBeNull();
    expect(
      readCrl(
        makeCrl({ issuer: other, thisUpdate: yesterday, nextUpdate: tomorrow }),
        root.x509,
        now,
      ),
    ).toBeNull();
    expect(readCrl(crl({ nextUpdate: new Date(now.getTime() - 1000) }), root.x509, now)).toBeNull();
    expect(readCrl(crl({ nextUpdate: undefined }), root.x509, now)).toBeNull();
    expect(
      readCrl(
        crl({ thisUpdate: tomorrow, nextUpdate: new Date(now.getTime() + 2 * DAY) }),
        root.x509,
        now,
      ),
    ).toBeNull();
    const changed = crl({ revoked: ["0a0b"] });
    changed[changed.length - 5]! ^= 1;
    expect(readCrl(changed, root.x509, now)).toBeNull();
    expect(readCrl(new Uint8Array([0x30, 0x03, 1, 2, 3]), root.x509, now)).toBeNull();
  });

  it("leaves out delta and indirect lists and unknown critical extensions", () => {
    const delta = crlExtension("2.5.29.27", encode(TAG.INTEGER, Uint8Array.of(1)), true);
    const indirect = crlExtension(
      "2.5.29.28",
      encode(TAG.SEQUENCE, encode(0x84, Uint8Array.of(0xff))),
      true,
    );
    const usersOnly = crlExtension(
      "2.5.29.28",
      encode(TAG.SEQUENCE, encode(0x81, Uint8Array.of(0xff))),
      true,
    );
    const unknown = crlExtension("1.2.3.4", encode(TAG.NULL), true);
    const number = crlExtension("2.5.29.20", encode(TAG.INTEGER, Uint8Array.of(7)));
    expect(readCrl(crl({ extensions: [delta] }), root.x509, now)).toBeNull();
    expect(readCrl(crl({ extensions: [indirect] }), root.x509, now)).toBeNull();
    expect(readCrl(crl({ extensions: [unknown] }), root.x509, now)).toBeNull();
    expect(readCrl(crl({ extensions: [usersOnly, number] }), root.x509, now)).not.toBeNull();
  });
});

describe("createCrlCheck", () => {
  it("fetches a list once and keeps it until its next update", async () => {
    let at = now;
    const get = vi.fn(async () =>
      makeCrl({
        issuer: root,
        revoked: ["0a0b"],
        thisUpdate: yesterday,
        nextUpdate: new Date(now.getTime() + 60_000),
      }),
    );
    const check = createCrlCheck({ get, now: () => at });
    const [one, two] = await Promise.all([
      check(leaf.x509, root.x509),
      check(leaf.x509, root.x509),
    ]);
    expect([one, two]).toEqual(["revoked", "revoked"]);
    expect(await check(leaf.x509, root.x509)).toBe("revoked");
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(URL_A);
    at = new Date(now.getTime() + 61_000);
    // Past its next update: fetched again, and now stale, so nothing is said.
    expect(await check(leaf.x509, root.x509)).toBe("unknown");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("asks again after a failure only when the retry time is past", async () => {
    let at = now;
    const get = vi.fn(async () => null);
    const check = createCrlCheck({ get, now: () => at, retryMs: 60_000 });
    expect(await check(leaf.x509, root.x509)).toBe("unknown");
    expect(await check(leaf.x509, root.x509)).toBe("unknown");
    expect(get).toHaveBeenCalledTimes(1);
    at = new Date(now.getTime() + 61_000);
    await check(leaf.x509, root.x509);
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe("checkTrust with revocation lists", () => {
  const post = async () => null;
  it("asks the list when the certificate names no OCSP responder", async () => {
    const get = async () =>
      makeCrl({ issuer: root, revoked: ["0a0b"], thisUpdate: yesterday, nextUpdate: tomorrow });
    const trust = await checkTrust(
      { certificate: leaf.pem, chain: [] },
      { roots: [root.x509], post, crl: createCrlCheck({ get, now: () => now }), now: () => now },
    );
    expect(trust).toEqual({ chain: "trusted", revocation: "revoked", root: "Stelle" });
    const without = await checkTrust(
      { certificate: leaf.pem, chain: [] },
      { roots: [root.x509], post, now: () => now },
    );
    expect(without?.revocation).toBe("unknown");
  });
});
