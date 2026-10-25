/**
 * /api/pgp: one's own key (only as the browser locked it) and the public keys of others one knows,
 * with a lookup on keys.openpgp.org and per WKD (from the server: browsers may not ask other
 * sites; only https on the internet). And WKD for the company's own people under
 * /.well-known/openpgpkey, so Thunderbird and others find their keys.
 */
import { lookup } from "node:dns/promises";
import { Hono } from "hono";
import { readKey } from "openpgp";
import { z } from "zod";
import type { SessionAccount } from "../categories/routes";
import { isPrivateAddress } from "../unsubscribe/private-address";
import { lockedPrivateKey, publicKeyInfo, wkdHash } from "./keys";
import type { PgpStore } from "./store";

/** colleague: a member's own key, seen in a confidential chat (docs/encryption.md, building block 5). */
const SOURCES = ["autocrypt", "attachment", "import", "keyserver", "wkd", "colleague"] as const;
const armored = z.string().min(50).max(200_000);
const email = z.string().trim().toLowerCase().email().max(254);

export type PgpDeps = {
  store: PgpStore;
  accountsOf: (request: Request) => Promise<SessionAccount[] | null>;
  /** Looks up a host's addresses; DNS unless a test says otherwise. */
  resolve?: (host: string) => Promise<string[]>;
  /** Fetches a key from the internet; tests give a stand-in. */
  fetchKey?: (url: string) => Promise<string | Uint8Array | null>;
};

/** Over https, to hosts on the internet only, a few seconds. */
const internetFetch =
  (resolve: (host: string) => Promise<string[]>) =>
  async (url: string): Promise<string | Uint8Array | null> => {
    const target = new URL(url);
    const addresses = await resolve(target.hostname).catch(() => []);
    if (target.protocol !== "https:" || !addresses.length || addresses.some(isPrivateAddress)) {
      return null;
    }
    const response = await fetch(target, {
      redirect: "error",
      signal: AbortSignal.timeout(6000),
    }).catch(() => null);
    if (!response?.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length > 200_000 ? null : bytes;
  };

/** Armored text from what a keyserver or WKD gave (WKD gives the binary key). */
const toArmored = async (data: string | Uint8Array | null): Promise<string | null> => {
  if (!data) return null;
  const text = typeof data === "string" ? data : new TextDecoder().decode(data);
  if (text.includes("-----BEGIN PGP PUBLIC KEY BLOCK-----")) return text;
  try {
    const key = await readKey({
      binaryKey: typeof data === "string" ? new TextEncoder().encode(data) : data,
    });
    return key.armor();
  } catch {
    return null;
  }
};

export const createPgpRoutes = ({
  store,
  accountsOf,
  resolve = async (host) => (await lookup(host, { all: true })).map((entry) => entry.address),
  fetchKey,
}: PgpDeps) => {
  const get = fetchKey ?? internetFetch(resolve);
  const app = new Hono<{ Variables: { me: string; address: string } }>();
  app.use(async (c, next) => {
    const own = (await accountsOf(c.req.raw))?.find((account) => account.isPersonal);
    if (!own) return c.json({ error: "Nicht angemeldet" }, 401);
    c.set("me", own.id);
    c.set("address", (own.name ?? "").toLowerCase());
    await next();
  });

  app.get("/me", async (c) => c.json({ key: await store.own(c.get("me")) }));

  app.put("/me", async (c) => {
    const parsed = z
      .object({ publicKey: armored, privateKey: armored, recoveryKey: armored })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    const info = await publicKeyInfo(parsed.data.publicKey);
    if (!info?.emails.includes(c.get("address"))) {
      return c.json({ error: `Der Schlüssel gehört nicht zu ${c.get("address")}.` }, 400);
    }
    // The secret part only locked, both times the same key.
    const [byPassphrase, byRecovery] = await Promise.all([
      lockedPrivateKey(parsed.data.privateKey),
      lockedPrivateKey(parsed.data.recoveryKey),
    ]);
    if (byPassphrase !== info.fingerprint || byRecovery !== info.fingerprint) {
      return c.json({ error: "Der geheime Schlüssel muss verschlüsselt sein und passen." }, 400);
    }
    await store.setOwn(c.get("me"), {
      email: c.get("address"),
      fingerprint: info.fingerprint,
      ...parsed.data,
    });
    return c.json({ key: await store.own(c.get("me")) });
  });

  app.delete("/me", async (c) => {
    await store.removeOwn(c.get("me"));
    return c.json({ ok: true });
  });

  app.get("/keys", async (c) => c.json({ keys: await store.known(c.get("me")) }));

  app.put("/keys", async (c) => {
    const parsed = z
      .object({ publicKey: armored, source: z.enum(SOURCES), email: email.optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    const info = await publicKeyInfo(parsed.data.publicKey);
    if (!info?.emails.length) return c.json({ error: "Kein öffentlicher Schlüssel." }, 400);
    // From a mail: only for the address it came from (Autocrypt), not for any in the key.
    const emails = parsed.data.email
      ? info.emails.filter((candidate) => candidate === parsed.data.email)
      : info.emails;
    if (!emails.length) return c.json({ error: "Der Schlüssel passt nicht zur Adresse." }, 400);
    for (const address of emails) {
      await store.remember(c.get("me"), {
        email: address,
        fingerprint: info.fingerprint,
        publicKey: parsed.data.publicKey,
        source: parsed.data.source,
      });
    }
    return c.json({ keys: await store.known(c.get("me")) });
  });

  app.post("/keys/remove", async (c) => {
    const parsed = email.safeParse((await c.req.json().catch(() => null))?.email);
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    await store.forget(c.get("me"), parsed.data);
    return c.json({ keys: await store.known(c.get("me")) });
  });

  /** Somebody's key from the internet: WKD of their domain first, then keys.openpgp.org. */
  app.get("/lookup", async (c) => {
    const parsed = email.safeParse(c.req.query("email"));
    if (!parsed.success) return c.json({ error: "Keine gültige Adresse." }, 400);
    const [local = "", domain = ""] = parsed.data.split("@");
    const hash = await wkdHash(local);
    const tries: [string, "wkd" | "keyserver"][] = [
      [
        `https://openpgpkey.${domain}/.well-known/openpgpkey/${domain}/hu/${hash}?l=${encodeURIComponent(local)}`,
        "wkd",
      ],
      [`https://${domain}/.well-known/openpgpkey/hu/${hash}?l=${encodeURIComponent(local)}`, "wkd"],
      [`https://keys.openpgp.org/vks/v1/by-email/${encodeURIComponent(parsed.data)}`, "keyserver"],
    ];
    for (const [url, source] of tries) {
      const found = await toArmored(await get(url).catch(() => null));
      const info = found ? await publicKeyInfo(found) : null;
      if (found && info?.emails.includes(parsed.data)) {
        return c.json({ publicKey: found, fingerprint: info.fingerprint, source });
      }
    }
    return c.json({ publicKey: null });
  });

  return app;
};

/**
 * WKD for the company's people (advanced and direct method): the binary public key of whoever has
 * one, by the hash of the address's local part. Needs no sign-in, as it is meant to be found.
 */
export const createWkdRoutes = (store: Pick<PgpStore, "allOwn">) => {
  const app = new Hono();
  const find = async (domain: string | undefined, hash: string) => {
    for (const own of await store.allOwn()) {
      const [local = "", ownDomain = ""] = own.email.split("@");
      if (domain && ownDomain !== domain.toLowerCase()) continue;
      if ((await wkdHash(local)) === hash)
        return (await readKey({ armoredKey: own.publicKey })).write();
    }
    return null;
  };
  const answer = async (domain: string | undefined, hash: string) => {
    const key = await find(domain, hash);
    return key
      ? new Response(new Blob([key as Uint8Array<ArrayBuffer>]), {
          headers: {
            "content-type": "application/octet-stream",
            "access-control-allow-origin": "*",
          },
        })
      : new Response("Unbekannt", { status: 404 });
  };
  app.get("/:domain/hu/:hash", (c) => answer(c.req.param("domain"), c.req.param("hash")));
  app.get("/hu/:hash", (c) => answer(undefined, c.req.param("hash")));
  app.get("/policy", (c) => c.body("", 200, { "access-control-allow-origin": "*" }));
  app.get("/:domain/policy", (c) => c.body("", 200, { "access-control-allow-origin": "*" }));
  return app;
};
