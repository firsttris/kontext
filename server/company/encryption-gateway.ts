/**
 * Mails beim Versand verschlüsseln: Stalwart's encryption gateway (since 1.0.2) encrypts an
 * outgoing mail for a recipient outside the company whose key it knows. With `gatewayEnable` alone
 * Stalwart's defaults apply: `opportunistic` for every recipient outside the own domains, any key
 * from `harvested` up (gatewayOutbound, gatewayMinTrust in Encryption::default,
 * crates/registry/src/schema/structs_impl.rs of stalwartlabs/stalwart v1.0.3). The keys are
 * `ExternalPublicKey` objects: pasted (`Manual`), looked up by Stalwart (`Automatic` over WKD or
 * keys.openpgp.org, crates/common/src/gateway/discovery/mod.rs) or learnt from incoming mail.
 * Rights: sysEncryption*, sysExternalPublicKey*, actionReloadSettings (stalwart-setup.ts).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Result } from "./accounts";
import { bad, bodyOf, type Env } from "./context";
import { firstError, type Invocation, type SetResult } from "./management";

type Request = (methodCalls: Invocation[]) => Promise<Invocation[]>;

/** Where Stalwart has the key from: pasted, looked up, or learnt from a mail it received. */
export type KeyOrigin = "manual" | "wkd" | "vks" | "harvested";

export type RecipientKey = {
  id: string;
  email: string;
  origin: KeyOrigin;
  /** Null while Stalwart has not found one (yet). */
  fingerprint: string | null;
  /** Whether Stalwart has looked at least once; with no fingerprint: nothing found. */
  checked: boolean;
};

export type GatewayView = { known: boolean; enabled: boolean; keys: RecipientKey[] };

type RawKey = {
  id: string;
  emailAddress: string;
  source: { "@type": string; method?: string };
  fingerprint?: string | null;
  lastChecked?: string | null;
};

const originOf = (source: RawKey["source"]): KeyOrigin =>
  source["@type"] === "Manual"
    ? "manual"
    : source["@type"] === "Automatic"
      ? source.method === "vks"
        ? "vks"
        : "wkd"
      : "harvested";

export const toRecipientKey = (raw: RawKey): RecipientKey => ({
  id: raw.id,
  email: raw.emailAddress,
  origin: originOf(raw.source),
  fingerprint: raw.fingerprint ?? null,
  checked: Boolean(raw.lastChecked) || raw.source["@type"] !== "Automatic",
});

export const addSchema = z.union([
  z.object({ email: z.string().trim().toLowerCase().email().max(254), key: z.string().min(1) }),
  z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    lookup: z.enum(["wkd", "vks"]),
  }),
]);
export type NewKey = z.infer<typeof addSchema>;

/** The ExternalPublicKey to create: the pasted key, or an address Stalwart looks up itself. */
export const keyObject = (body: NewKey) =>
  "key" in body
    ? { emailAddress: body.email, key: body.key.trim(), source: { "@type": "Manual" } }
    : { emailAddress: body.email, source: { "@type": "Automatic", method: body.lookup } };

const resultOf = (result: SetResult): Result<null> => {
  const error = firstError(result);
  return error ? { ok: false, error } : { ok: true, value: null };
};

export const createEncryptionGateway = (request: Request) => {
  const set = async (method: string, args: Record<string, unknown>) =>
    resultOf((await request([[method, args, "0"]]))[0]![1] as SetResult);

  /** known: false when the key lacks the rights (setup command not run again since 1.0.3). */
  const read = async (): Promise<GatewayView> => {
    try {
      const [encryption, keys] = await request([
        ["x:Encryption/get", { ids: ["singleton"], properties: ["gatewayEnable"] }, "e"],
        [
          "x:ExternalPublicKey/get",
          { ids: null, properties: ["emailAddress", "source", "fingerprint", "lastChecked"] },
          "k",
        ],
      ]);
      const settings = (encryption![1].list as { gatewayEnable?: boolean }[])[0];
      const list = (keys![1].list as RawKey[]).map(toRecipientKey);
      list.sort((a, b) => a.email.localeCompare(b.email));
      return { known: true, enabled: Boolean(settings?.gatewayEnable), keys: list };
    } catch {
      return { known: false, enabled: false, keys: [] };
    }
  };

  /** Stalwart reads the setting at start and on ReloadSettings (as for Sharing, stalwart-setup.ts). */
  const setEnabled = async (enabled: boolean): Promise<Result<null>> => {
    const changed = await set("x:Encryption/set", {
      update: { singleton: { gatewayEnable: enabled } },
    });
    if (!changed.ok) return changed;
    return set("x:Action/set", { create: { r: { "@type": "ReloadSettings" } } });
  };

  const addKey = (body: NewKey) =>
    set("x:ExternalPublicKey/set", { create: { k: keyObject(body) } });

  const removeKey = (id: string) => set("x:ExternalPublicKey/set", { destroy: [id] });

  return { read, setEnabled, addKey, removeKey };
};

export type EncryptionGateway = ReturnType<typeof createEncryptionGateway>;

export const encryptionGatewayRoutes = (gateway: EncryptionGateway) => {
  const app = new Hono<Env>();
  const answer = async (result: Result<null>) =>
    result.ok ? Response.json(await gateway.read()) : bad(result.error);
  app.get("/", async (c) => c.json(await gateway.read()));
  app.put("/", async (c) => {
    const body = await bodyOf(c, z.object({ enabled: z.boolean() }));
    if (!body) return bad("Angaben unvollständig.");
    return answer(await gateway.setEnabled(body.enabled));
  });
  app.post("/keys", async (c) => {
    const body = await bodyOf(c, addSchema);
    if (!body) return bad("Keine gültige E-Mail-Adresse oder kein Schlüssel.");
    return answer(await gateway.addKey(body));
  });
  app.delete("/keys/:id", async (c) => answer(await gateway.removeKey(c.req.param("id"))));
  return app;
};
