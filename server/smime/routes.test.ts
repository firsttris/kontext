// @vitest-environment node
import forge from "node-forge";
import { describe, expect, it } from "vitest";
import { createSmimeRoutes } from "./routes";
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

const setup = () => {
  const app = createSmimeRoutes({
    store: memory(),
    accountsOf: async () => [
      { id: "jonas", isPersonal: true, isReadOnly: false, name: "jonas@weber.test" },
    ],
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
});
