// @vitest-environment node
import { createPrivateKey, sign, X509Certificate } from "node:crypto";
import forge from "node-forge";
import { describe, expect, it } from "vitest";
import { children, encode, encodeOid, read, TAG, whole } from "./der";
import {
  buildChain,
  certFromSmimea,
  checkTrust,
  ocspUrl,
  readOcspResponse,
  smimeaName,
} from "./trust";

const OCSP_URL = "http://ocsp.test-ca.test/";
const DAY = 86_400_000;
const now = new Date("2026-10-25T10:00:00Z");

const binary = (bytes: Uint8Array) => String.fromCharCode(...bytes);

/** The AIA extension pointing at an OCSP responder. */
const infoAccess = () =>
  binary(
    encode(
      TAG.SEQUENCE,
      encode(
        TAG.SEQUENCE,
        encodeOid("1.3.6.1.5.5.7.48.1"),
        encode(0x86, new TextEncoder().encode(OCSP_URL)),
      ),
    ),
  );

type Made = { cert: forge.pki.Certificate; key: forge.pki.rsa.PrivateKey; x509: X509Certificate };

const make = (
  name: string,
  serial: string,
  issuer: Made | null,
  {
    ca = false,
    email,
    days = 365,
    purpose = "email",
  }: {
    ca?: boolean;
    email?: string;
    days?: number;
    purpose?: "email" | "server" | "ocsp";
  } = {},
): Made => {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = serial;
  cert.validity.notBefore = new Date(now.getTime() - DAY);
  cert.validity.notAfter = new Date(now.getTime() + days * DAY);
  cert.setSubject([{ name: "organizationName", value: name }]);
  cert.setIssuer(
    issuer ? issuer.cert.subject.attributes : [{ name: "organizationName", value: name }],
  );
  cert.setExtensions(
    ca
      ? [
          { name: "basicConstraints", cA: true },
          { name: "keyUsage", keyCertSign: true },
        ]
      : [
          { name: "basicConstraints", cA: false },
          purpose === "email"
            ? { name: "extKeyUsage", emailProtection: true }
            : purpose === "ocsp"
              ? {
                  id: "2.5.29.37",
                  value: binary(encode(TAG.SEQUENCE, encodeOid("1.3.6.1.5.5.7.3.9"))),
                }
              : { name: "extKeyUsage", serverAuth: true },
          ...(email ? [{ name: "subjectAltName", altNames: [{ type: 1, value: email }] }] : []),
          { id: "1.3.6.1.5.5.7.1.1", value: infoAccess() },
        ],
  );
  cert.sign(issuer?.key ?? keys.privateKey, forge.md.sha256.create());
  const pem = forge.pki.certificateToPem(cert);
  return { cert, key: keys.privateKey, x509: new X509Certificate(pem) };
};

const root = make("Test-Wurzel", "01", null, { ca: true });
const middle = make("Test-Zwischenstelle", "02", root, { ca: true });
const leaf = make("Amt", "0a0b", middle, { email: "amt@stadt.test" });
const pem = (made: Made) => made.x509.toString();

const time = (date: Date) =>
  encode(
    0x18,
    new TextEncoder().encode(
      `${date
        .toISOString()
        .replace(/[-:T]|\.\d+/g, "")
        .slice(0, 14)}Z`,
    ),
  );

/** An OCSP answer for the request, signed by `signer`, saying `state`. */
const ocspAnswer = (
  request: Uint8Array,
  state: "good" | "revoked",
  signer: Made,
  { next = new Date(now.getTime() + DAY), certs = [] as Made[] } = {},
) => {
  const certId = children(children(children(children(read(request))[0]!)[0]!)[0]!)[0]!;
  const status =
    state === "good" ? encode(0x80) : encode(0xa1, time(new Date(now.getTime() - DAY)));
  const single = encode(TAG.SEQUENCE, whole(certId), status, time(now), encode(0xa0, time(next)));
  const tbs = encode(
    TAG.SEQUENCE,
    encode(0xa2, encode(TAG.OCTET_STRING, new Uint8Array(20))),
    time(now),
    encode(TAG.SEQUENCE, single),
  );
  const key = createPrivateKey(forge.pki.privateKeyToPem(signer.key));
  const signature = new Uint8Array(sign("sha256", tbs, key));
  const basic = encode(
    TAG.SEQUENCE,
    tbs,
    encode(TAG.SEQUENCE, encodeOid("1.2.840.113549.1.1.11"), encode(TAG.NULL)),
    encode(TAG.BIT_STRING, new Uint8Array([0, ...signature])),
    ...(certs.length
      ? [encode(0xa0, encode(TAG.SEQUENCE, ...certs.map((c) => new Uint8Array(c.x509.raw))))]
      : []),
  );
  return encode(
    TAG.SEQUENCE,
    encode(0x0a, new Uint8Array([0])),
    encode(
      0xa0,
      encode(TAG.SEQUENCE, encodeOid("1.3.6.1.5.5.7.48.1.1"), encode(TAG.OCTET_STRING, basic)),
    ),
  );
};

describe("S/MIME trust", () => {
  it("builds the chain over the intermediate the mail brought to a trusted root", () => {
    const built = buildChain(leaf.x509, [middle.x509], [root.x509], now);
    expect(built.state).toBe("trusted");
    expect(built.chain.map((cert) => cert.subject)).toEqual([
      "O=Amt",
      "O=Test-Zwischenstelle",
      "O=Test-Wurzel",
    ]);
    // Without the intermediate, or with another root, no way up.
    expect(buildChain(leaf.x509, [], [root.x509], now).state).toBe("untrusted");
    const other = make("Andere Wurzel", "09", null, { ca: true });
    expect(buildChain(leaf.x509, [middle.x509], [other.x509], now).state).toBe("untrusted");
  });

  it("refuses certificates out of date or not meant for mail", () => {
    const old = make("Alt", "0c", middle, { days: -1 });
    expect(buildChain(old.x509, [middle.x509], [root.x509], now).state).toBe("expired");
    const server = make("Webserver", "0d", middle, { purpose: "server" });
    expect(buildChain(server.x509, [middle.x509], [root.x509], now).state).toBe("not-for-mail");
  });

  it("asks the authority whether it was revoked, and believes only signed answers", async () => {
    expect(ocspUrl(leaf.x509)).toBe(OCSP_URL);
    const asked: string[] = [];
    const answering =
      (state: "good" | "revoked", signer: Made, options = {}) =>
      async (url: string, body: Uint8Array) => {
        asked.push(url);
        return ocspAnswer(body, state, signer, options);
      };
    const deps = { roots: [root.x509], now: () => now };
    const input = { certificate: pem(leaf), chain: [pem(middle)] };
    expect(await checkTrust(input, { ...deps, post: answering("good", middle) })).toEqual({
      chain: "trusted",
      revocation: "good",
      root: "Test-Wurzel",
    });
    expect(asked).toEqual([OCSP_URL]);
    expect(
      (await checkTrust(input, { ...deps, post: answering("revoked", middle) }))?.revocation,
    ).toBe("revoked");
    // A responder the issuer named for this may answer; anyone else may not.
    const responder = make("OCSP-Dienst", "0e", middle, { purpose: "ocsp" });
    expect(
      (
        await checkTrust(input, {
          ...deps,
          post: answering("revoked", responder, { certs: [responder] }),
        })
      )?.revocation,
    ).toBe("revoked");
    const stranger = make("Fremd", "0f", null, { ca: true });
    expect(
      (
        await checkTrust(input, {
          ...deps,
          post: answering("revoked", stranger, { certs: [stranger] }),
        })
      )?.revocation,
    ).toBe("unknown");
    // An answer whose time is up says nothing.
    expect(
      (
        await checkTrust(input, {
          ...deps,
          post: answering("good", middle, { next: new Date(now.getTime() - DAY) }),
        })
      )?.revocation,
    ).toBe("unknown");
    expect((await checkTrust(input, { ...deps, post: async () => null }))?.revocation).toBe(
      "unknown",
    );
  });

  it("reads nothing into a broken answer", () => {
    expect(readOcspResponse(new Uint8Array([1, 2, 3]), leaf.x509, middle.x509, now)).toBe(
      "unknown",
    );
  });

  it("finds a certificate in DNS (SMIMEA), only the full one", () => {
    expect(smimeaName("hugh@example.com")).toBe(
      "c93f1e400f26708f98cb19d936620da35eec8f72e57f9eec01c1afd6._smimecert.example.com",
    );
    const hex = Buffer.from(leaf.x509.raw).toString("hex");
    expect(certFromSmimea(`3 0 0 ${hex}`)).toBe(pem(leaf));
    const bytes = `030000${hex}`;
    expect(certFromSmimea(`\\# ${bytes.length / 2} ${bytes}`)).toBe(pem(leaf));
    expect(certFromSmimea(`3 1 1 ${"ab".repeat(32)}`)).toBeNull();
    expect(certFromSmimea("3 0 0 kaputt")).toBeNull();
  });
});
