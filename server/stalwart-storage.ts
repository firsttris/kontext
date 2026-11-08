/**
 * Stalwart's storage encrypted and compressed (docs/installation.md, "Speicher verschlüsseln und
 * komprimieren"): mails and files are written with Zstandard and encrypted with a server key,
 * and a BlobRecode task rewrites what is already stored. Part of the setup command
 * (server/setup-stalwart.ts); idempotent like the rest of it.
 *
 * The key is a SymmetricKey that Stalwart reads from its environment variable
 * STALWART_BLOB_KEY (32 bytes, Base64), so it is neither in Stalwart's database nor in the
 * backup. Without the variable Stalwart refuses the key, and the storage is only compressed.
 *
 * Objects and properties: crates/registry/src/schema/structs.rs of stalwartlabs/stalwart v1.0.3
 * (SymmetricKey, SecretKey, Email, FileStorage, Task::BlobRecode, TaskBlobRecodeEncryption), the
 * values in crates/registry/src/schema/enums_impl.rs (CompressionAlgo, SymmetricCipher,
 * TaskBlobRecodeCompression); the key is checked on creation in
 * crates/jmap/src/registry/mapping/symmetric_key.rs, the settings take effect with
 * ReloadSettings (crates/common/src/config/blob.rs, parsed with the Core in cache/reload.rs).
 */
import type { Result } from "./company/accounts";
import type { Invocation } from "./company/management";
import { applyPlan, type Plan, type Request } from "./stalwart-setup";

export const BLOB_KEY_VARIABLE = "STALWART_BLOB_KEY";
export const KEY_NAME = "Kontext";
export const COMPRESSION = "zstd";

export type SymmetricKey = { id: string; description: string };
export type BlobSettings = { compressionAlgorithm?: string; blobEncryptionKey?: string | null };

/** What the admin reads when Stalwart refused the key: the storage is then only compressed. */
export const keyHint = (error: string): string =>
  `Hinweis: Speicher nicht verschlüsselt (${error}). Einen Schlüssel mit ` +
  `\`openssl rand -base64 32\` als ${BLOB_KEY_VARIABLE} in deploy/.env eintragen ` +
  "(Quadlet: deploy/stalwart.env), auch im Passwortmanager ablegen, Stalwart neu starten und " +
  "den Befehl erneut ausführen. Fehlt Stalwarts Admin-Rolle das Recht dafür (Stalwart von vor " +
  "1.0.3 aktualisiert): Stalwart einmal mit STALWART_UPDATE_ROLE_PERMISSIONS=true starten.";

/**
 * What the admin reads when Stalwart refused the BlobRecode task: what is stored stays as it is,
 * new mails and files follow the settings. The right taskBlobRecode came with Stalwart 1.0.3
 * (crates/registry/src/utils/task.rs), so an updated admin role lacks it.
 */
export const recodeHint = (error: string): string =>
  `Hinweis: Vorhandene Mails und Dateien nicht umgeschrieben (BlobRecode: ${error}). Fehlt ` +
  "Stalwarts Admin-Rolle das Recht dafür (Stalwart von vor 1.0.3 aktualisiert): Stalwart einmal " +
  "mit STALWART_UPDATE_ROLE_PERMISSIONS=true starten.";

/** The server key, created once; Stalwart reads its secret from the environment variable. */
export const keyPlan = (keys: SymmetricKey[]): Plan & { existing?: string } => {
  const known = keys.find((key) => key.description === KEY_NAME);
  if (known) return { calls: [], message: "Speicherschlüssel gibt es schon.", existing: known.id };
  const key = {
    description: KEY_NAME,
    cipher: "aes256Gcm",
    key: { "@type": "EnvironmentVariable", variableName: BLOB_KEY_VARIABLE },
  };
  return {
    calls: [["x:SymmetricKey/set", { create: { key } }, "0"]],
    message: `Speicherschlüssel angelegt (aus ${BLOB_KEY_VARIABLE}).`,
  };
};

const SETTINGS = ["Email", "FileStorage"] as const;
type Settings = Record<(typeof SETTINGS)[number], BlobSettings>;

/**
 * The key the storage is to be encrypted with: one the admin set already stays, otherwise ours
 * (when Stalwart has it).
 */
export const wantedKey = (current: BlobSettings, keyId?: string): string | undefined =>
  current.blobEncryptionKey ?? keyId;

const isWanted = (current: BlobSettings, keyId?: string): boolean =>
  current.compressionAlgorithm === COMPRESSION &&
  (current.blobEncryptionKey ?? undefined) === wantedKey(current, keyId);

/**
 * Mails (Email) and files (FileStorage) written with Zstandard and the key, then the settings
 * reloaded so new blobs follow them. No calls when both are as wanted.
 */
export const settingsPlan = (settings: Settings, keyId?: string): Plan => {
  const outdated = SETTINGS.filter((name) => !isWanted(settings[name], keyId));
  if (!outdated.length)
    return {
      calls: [],
      message: keyId
        ? "Speicher ist schon verschlüsselt und komprimiert."
        : "Speicher ist schon komprimiert.",
    };
  const calls: Invocation[] = outdated.map((name, index) => {
    const key = wantedKey(settings[name], keyId);
    const patch = { compressionAlgorithm: COMPRESSION, ...(key ? { blobEncryptionKey: key } : {}) };
    return [`x:${name}/set`, { update: { singleton: patch } }, String(index)];
  });
  calls.push([
    "x:Action/set",
    { create: { r: { "@type": "ReloadSettings" } } },
    String(outdated.length),
  ]);
  return {
    calls,
    message: keyId
      ? "Speicher wird ab jetzt verschlüsselt und mit Zstandard komprimiert."
      : "Speicher wird ab jetzt mit Zstandard komprimiert (nicht verschlüsselt).",
  };
};

/** Rewrites what is already stored with the compression and, given one, the key. */
export const recodePlan = (keyId?: string): Plan => ({
  calls: [
    [
      "x:Task/set",
      {
        create: {
          recode: {
            "@type": "BlobRecode",
            compression: COMPRESSION,
            encryption: keyId ? { "@type": "Encrypt", keyId } : { "@type": "Keep" },
          },
        },
      },
      "0",
    ],
  ],
  message: "Vorhandene Mails und Dateien werden im Hintergrund umgeschrieben (BlobRecode).",
});

const getList = async <T>(request: Request, call: Invocation): Promise<T[]> =>
  ((await request([call]))[0]?.[1].list ?? []) as T[];

const getSetting = async (request: Request, name: string): Promise<BlobSettings> => {
  const [setting = {}] = await getList<BlobSettings>(request, [
    `x:${name}/get`,
    { ids: ["singleton"], properties: ["compressionAlgorithm", "blobEncryptionKey"] },
    "0",
  ]);
  return setting;
};

/** Our key's id, or Stalwart's reason for refusing it (no variable, no right). */
const ensureKey = async (request: Request): Promise<Result<string>> => {
  const keys = await getList<SymmetricKey>(request, [
    "x:SymmetricKey/get",
    { ids: null, properties: ["description"] },
    "0",
  ]);
  const plan = keyPlan(keys);
  if (plan.existing) return { ok: true, value: plan.existing };
  const result = await applyPlan(request, plan);
  if (!result.ok) return result;
  const id = result.value.created?.key?.id;
  return id
    ? { ok: true, value: id }
    : { ok: false, error: "Stalwart hat keinen Schlüssel geliefert" };
};

/**
 * Encrypts and compresses the storage: the key (a refusal only leaves the storage unencrypted,
 * with a hint), the settings, and the rewrite of what is there, only when the settings changed
 * (a refused rewrite too only leaves a hint).
 */
export const ensureStorage = async (request: Request): Promise<Result<string[]>> => {
  const key = await ensureKey(request);
  const keyId = key.ok ? key.value : undefined;
  const settings: Settings = {
    Email: await getSetting(request, "Email"),
    FileStorage: await getSetting(request, "FileStorage"),
  };
  const plan = settingsPlan(settings, keyId);
  const messages = [...(key.ok ? [] : [keyHint(key.error)]), plan.message];
  if (!plan.calls.length) return { ok: true, value: messages };
  const applied = await applyPlan(request, plan);
  if (!applied.ok) return { ok: false, error: `Speicher: ${applied.error}` };
  const recode = recodePlan(wantedKey(settings.Email, keyId));
  const started = await applyPlan(request, recode);
  return {
    ok: true,
    value: [...messages, started.ok ? recode.message : recodeHint(started.error)],
  };
};
