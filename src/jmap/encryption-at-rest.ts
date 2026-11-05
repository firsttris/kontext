/**
 * Mails kept encrypted on the server (docs/encryption.md, "Auf dem Server verschlüsselt
 * ablegen"): Stalwart's per-account `encryptionAtRest` in x:AccountSettings, pointing at one of
 * the account's x:PublicKey objects (crates/registry/src/schema/structs.rs `EncryptionAtRest`,
 * `EncryptionSettings`, `PublicKey`). A user may read and set both for their own account
 * (crates/common/src/auth/permissions.rs gives the User role `sysAccountSettings*` and
 * `sysPublicKey*`; the full OAuth scope includes them, crates/common/src/auth/oauth/scope.rs).
 * Group accounts have no settings of their own (crates/jmap/src/registry/mapping/account.rs
 * answers only for a user), so shared mailboxes stay as they are.
 */
import { assertSetOk, CAPABILITIES, type JmapClient } from "./client";

const STALWART = [CAPABILITIES.core, CAPABILITIES.stalwart];

/**
 * `headerProtection` stays at its default: hiding the subject (`Baseline`) is refused for
 * encryption at rest (crates/jmap/src/registry/mapping/public_key.rs
 * `validate_encryption_at_rest`), so the subject stays readable in the list.
 */
export type EncryptionAtRest =
  | { "@type": "Disabled" }
  | { "@type": "Enabled"; publicKey: string; encryptOnAppend?: boolean };

export const getEncryptionAtRest = async (client: JmapClient): Promise<EncryptionAtRest> => {
  const { list } = await client.call<{ list: { encryptionAtRest?: EncryptionAtRest }[] }>(
    "x:AccountSettings/get",
    { ids: null, properties: ["encryptionAtRest"] },
    STALWART,
  );
  return list[0]?.encryptionAtRest ?? { "@type": "Disabled" };
};

export const setEncryptionAtRest = async (client: JmapClient, value: EncryptionAtRest) =>
  assertSetOk(
    await client.call(
      "x:AccountSettings/set",
      { update: { singleton: { encryptionAtRest: value } } },
      STALWART,
    ),
    "Verschlüsselung",
  );

type StalwartKey = { id: string; fingerprints?: string[] };

/** The registered key with that fingerprint (Stalwart writes it as upper-case hex). */
export const keyWithFingerprint = (keys: StalwartKey[], fingerprint: string) =>
  keys.find((key) =>
    key.fingerprints?.some((one) => one.toUpperCase() === fingerprint.toUpperCase()),
  );

/** The id of one's public key at Stalwart, if it is registered there. */
export const registeredKeyId = async (client: JmapClient, fingerprint: string) => {
  const { list } = await client.call<{ list: StalwartKey[] }>(
    "x:PublicKey/get",
    { ids: null, properties: ["id", "fingerprints"] },
    STALWART,
  );
  return keyWithFingerprint(list, fingerprint)?.id;
};

/**
 * Takes one's public key off Stalwart when the key goes: Stalwart keeps at most 5 per account by
 * default (crates/registry/src/schema/structs_impl.rs `max_public_keys`), and one is registered
 * for every new key. Only after encryption at rest no longer points at it: Stalwart refuses to
 * delete an object something still links to (crates/jmap/src/registry/set.rs, no orphans allowed).
 */
export const forgetPublicKey = async (client: JmapClient, fingerprint: string) => {
  const id = await registeredKeyId(client, fingerprint);
  if (!id) return;
  assertSetOk(await client.call("x:PublicKey/set", { destroy: [id] }, STALWART), "Schlüssel");
};

/** The id of one's public key at Stalwart; it is registered first if it is not there yet. */
export const ensurePublicKey = async (
  client: JmapClient,
  armored: string,
  fingerprint: string,
): Promise<string> => {
  const known = await registeredKeyId(client, fingerprint);
  if (known) return known;
  const result = await client.call<{ created?: Record<string, { id: string }> }>(
    "x:PublicKey/set",
    { create: { key: { key: armored, description: "Kontext" } } },
    STALWART,
  );
  assertSetOk(result, "Schlüssel");
  return result.created!.key!.id;
};
