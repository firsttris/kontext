// @vitest-environment node

import { X509Certificate } from "node:crypto";
import forge from "node-forge";
import { describe, expect, it } from "vitest";
import { createSmimeRoutes, type SmimeDeps } from "./routes";
import type { KnownCert, OwnCert, SmimeStore } from "./store";

const memory = (): SmimeStore => {
  const own = new Map<string, OwnCert>();
  const known = new Map<string, KnownCert[]>();
  return {
    own: async (id) => own.get(id) ?? null,
    setOwn: async (id, cert) => void own.set(id, cert),
    removeOwn: async (id) => void own.delete(id),
    known: async (id) => known.get(id) ?? [],
    remember: async (id, cert) => {
      const before = (known.get(id) ?? []).find((k) => k.email === cert.email);
      known.set(id, [
        ...(known.get(id) ?? []).filter((k) => k.email !== cert.email),
        {
          ...cert,
          previousFingerprint:
            before && before.fingerprint !== cert.fingerprint ? before.fingerprint : null,
          updatedAt: "",
        },
      ]);
    },
    forget: async (id, email) =>
      void known.set(
        id,
        (known.get(id) ?? []).filter((k) => k.email !== email),
      ),
  } as SmimeStore;
};

const keys = forge.pki.rsa.generateKeyPair(1024);
const certFor = (emails: string[], days = 365) => {
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 2 * 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + days * 86_400_000);
  const name = [{ name: "commonName", value: emails[0] ?? "x" }];
  cert.setSubject(name);
  cert.setIssuer([{ name: "organizationName", value: "Test-CA" }]);
  cert.setExtensions([
    { name: "subjectAltName", altNames: emails.map((value) => ({ type: 1, value })) },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
};

const setup = (more: Partial<SmimeDeps> = {}) => {
  const app = createSmimeRoutes({
    store: memory(),
    accountsOf: async () => [
      { id: "jonas", isPersonal: true, isReadOnly: false, name: "jonas@weber.test" },
    ],
    roots: [],
    ...more,
  });
  return (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
};

describe("/api/smime", () => {
  it("keeps one's own certificate only for one's own address", async () => {
    const call = setup();
    const p12 = "A".repeat(200);
    expect((await call("PUT", "/me", { certificate: certFor(["x@y.test"]), p12 })).status).toBe(
      400,
    );
    const saved = await call("PUT", "/me", { certificate: certFor(["jonas@weber.test"]), p12 });
    expect(saved.status).toBe(200);
    expect((await saved.json()).cert).toMatchObject({ email: "jonas@weber.test", p12 });
    await call("DELETE", "/me");
    expect((await (await call("GET", "/me")).json()).cert).toBeNull();
  });

  it("knows others' certificates: from a mail only for its sender, not when expired", async () => {
    const call = setup();
    const two = certFor(["amt@stadt.test", "post@stadt.test"]);
    const fromMail = await call("PUT", "/certs", {
      certificate: two,
      source: "mail",
      email: "post@stadt.test",
    });
    expect((await fromMail.json()).certs).toMatchObject([
      { email: "post@stadt.test", issuer: "Test-CA", source: "mail" },
    ]);
    const imported = await call("PUT", "/certs", { certificate: two, source: "import" });
    expect((await imported.json()).certs).toHaveLength(2);
    expect(
      (
        await call("PUT", "/certs", {
          certificate: certFor(["alt@stadt.test"], -1),
          source: "import",
        })
      ).status,
    ).toBe(400);
    expect(
      (await call("PUT", "/certs", { certificate: two, source: "mail", email: "x@y.test" })).status,
    ).toBe(400);
    const left = await call("POST", "/certs/remove", { email: "amt@stadt.test" });
    expect((await left.json()).certs).toMatchObject([{ email: "post@stadt.test" }]);
  });

  it("lets no certificate from a mail replace an imported one", async () => {
    const call = setup();
    const real = certFor(["amt@stadt.test"]);
    await call("PUT", "/certs", { certificate: real, source: "import" });
    const forged = await call("PUT", "/certs", {
      // Another certificate for the same address (another validity, so another fingerprint).
      certificate: certFor(["amt@stadt.test"], 200),
      source: "mail",
      email: "amt@stadt.test",
    });
    expect((await forged.json()).certs).toMatchObject([
      { email: "amt@stadt.test", certificate: real, source: "import" },
    ]);
  });

  it("checks the chain to a trusted root, once per hour per certificate", async () => {
    const pem = certFor(["amt@stadt.test"]);
    // certFor signs with its own key: its issuer is the root here.
    const issuer = forge.pki.createCertificate();
    issuer.publicKey = keys.publicKey;
    issuer.serialNumber = "05";
    issuer.validity.notBefore = new Date(Date.now() - 2 * 86_400_000);
    issuer.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
    issuer.setSubject([{ name: "organizationName", value: "Test-CA" }]);
    issuer.setIssuer([{ name: "organizationName", value: "Test-CA" }]);
    issuer.setExtensions([{ name: "basicConstraints", cA: true }]);
    issuer.sign(keys.privateKey, forge.md.sha256.create());
    const root = new X509Certificate(forge.pki.certificateToPem(issuer));
    let asked = 0;
    const call = setup({
      roots: [root],
      post: async () => {
        asked++;
        return null;
      },
    });
    const first = await call("POST", "/trust", { certificate: pem });
    expect((await first.json()).trust).toEqual({
      chain: "trusted",
      revocation: "unknown",
      root: "Test-CA",
    });
    await call("POST", "/trust", { certificate: pem });
    expect(asked).toBe(0); // no OCSP address in this certificate
    const untrusted = setup();
    expect(
      (await (await untrusted("POST", "/trust", { certificate: pem })).json()).trust.chain,
    ).toBe("untrusted");
    expect((await call("POST", "/trust", { certificate: "x".repeat(200) })).status).toBe(400);
  });

  it("finds a certificate in DNS only from a signed answer and for that address", async () => {
    const pem = certFor(["amt@stadt.test"]);
    const hex = Buffer.from(new X509Certificate(pem).raw).toString("hex");
    let secure = true;
    const call = setup({ resolve: async () => ({ data: [`3 0 0 ${hex}`], secure }) });
    const found = await call("GET", "/lookup?email=Amt@Stadt.test");
    expect((await found.json()).certificate).toContain("BEGIN CERTIFICATE");
    expect(
      (await (await call("GET", "/lookup?email=other@stadt.test")).json()).certificate,
    ).toBeNull();
    secure = false;
    expect(
      (await (await call("GET", "/lookup?email=amt@stadt.test")).json()).certificate,
    ).toBeNull();
  });
});
