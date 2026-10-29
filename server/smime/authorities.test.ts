// @vitest-environment node
import type { X509Certificate } from "node:crypto";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Env, Loaded } from "../company/context";
import { type Authority, authorityRoutes, parseAuthority, refusal } from "./authorities";
import { createSmimeRoutes } from "./routes";
import type { SmimeStore } from "./store";
import { DAY, makeCert } from "./test-certs";

const now = new Date();
const root = makeCert({
  organization: "Landesverwaltung Test",
  serial: "01",
  ca: true,
  kind: "p384",
  now,
});
const leaf = makeCert({
  organization: "Amt",
  serial: "0b",
  issuer: root,
  kind: "p256",
  email: "amt@land.test",
  now,
});

/** The store in memory, counting changes like the real one. */
const memory = () => {
  const kept: { cert: X509Certificate; authority: Authority }[] = [];
  let version = 0;
  return {
    list: async () => kept.map((entry) => entry.authority),
    certs: async () => kept.map((entry) => entry.cert),
    version: () => version,
    add: async (cert: X509Certificate, addedBy: string, at = new Date()) => {
      const authority: Authority = {
        fingerprint: cert.fingerprint256,
        subject: cert.subject,
        issuer: cert.issuer,
        notBefore: cert.validFrom,
        notAfter: cert.validTo,
        selfSigned: true,
        addedBy,
        createdAt: at.toISOString(),
      };
      kept.push({ cert, authority });
      version++;
      return authority;
    },
    remove: async (fingerprint: string) => {
      const at = kept.findIndex((entry) => entry.cert.fingerprint256 === fingerprint);
      if (at >= 0) kept.splice(at, 1);
      version++;
    },
  };
};

const admin = (store: ReturnType<typeof memory>) => {
  const app = new Hono<Env>();
  app.use(async (c, next) => {
    c.set("loaded", {
      company: { employees: [{ id: "j", email: "jonas@weber.test" }] },
      selfId: "j",
    } as unknown as Loaded);
    await next();
  });
  app.route("/", authorityRoutes(store));
  return (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
};

describe("S/MIME authorities of the company", () => {
  it("reads PEM and DER, and takes only a current authority", () => {
    expect(parseAuthority(root.pem)?.fingerprint256).toBe(root.x509.fingerprint256);
    expect(parseAuthority(Buffer.from(root.der).toString("base64"))?.fingerprint256).toBe(
      root.x509.fingerprint256,
    );
    expect(parseAuthority("kein Zertifikat")).toBeNull();
    expect(refusal(root.x509, now)).toBeNull();
    expect(refusal(leaf.x509, now)).toBe("Das ist kein Zertifikat einer Stelle (CA).");
    expect(refusal(root.x509, new Date(now.getTime() + 400 * DAY))).toBe(
      "Das Zertifikat ist abgelaufen.",
    );
  });

  it("lets the Firmenverwaltung add and remove one, once each", async () => {
    const store = memory();
    const call = admin(store);
    const added = await call("POST", "/", { certificate: root.pem });
    expect(added.status).toBe(201);
    const body = (await added.json()) as { authority: Authority; authorities: Authority[] };
    expect(body.authority).toMatchObject({ addedBy: "jonas@weber.test" });
    expect(body.authorities).toHaveLength(1);
    expect((await call("POST", "/", { certificate: root.pem })).status).toBe(409);
    const notCa = await call("POST", "/", { certificate: leaf.pem });
    expect(await notCa.json()).toEqual({ error: "Das ist kein Zertifikat einer Stelle (CA)." });
    expect((await call("POST", "/", { certificate: "x".repeat(150) })).status).toBe(400);
    const removed = await call("DELETE", `/${encodeURIComponent(root.x509.fingerprint256)}`);
    expect(((await removed.json()) as { authorities: Authority[] }).authorities).toEqual([]);
  });

  it("trusts a certificate of an added authority, and no longer once it is removed", async () => {
    const store = memory();
    const smime = createSmimeRoutes({
      store: {} as SmimeStore,
      accountsOf: async () => [{ id: "j", isPersonal: true, isReadOnly: false, name: "j@w.test" }],
      roots: [],
      authorities: store,
      post: async () => null,
    });
    const trust = async () =>
      (
        (await (
          await smime.request("/trust", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ certificate: leaf.pem }),
          })
        ).json()) as { trust: { chain: string; root: string | null } }
      ).trust;
    expect((await trust()).chain).toBe("untrusted");
    await store.add(root.x509, "jonas@weber.test");
    // The answer of an hour ago no longer holds: the authorities changed.
    expect(await trust()).toMatchObject({ chain: "trusted", root: "Landesverwaltung Test" });
    await store.remove(root.x509.fingerprint256);
    expect((await trust()).chain).toBe("untrusted");
  });
});
