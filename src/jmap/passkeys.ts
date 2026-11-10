/**
 * The person's passkeys, kept by Stalwart beside the password (x:Passkey, new in Stalwart 1.1.0;
 * Passkey in crates/registry/src/schema/structs.rs, crates/jmap/src/registry/mapping/passkey.rs).
 * A new one needs the current password (and the code with two-factor sign-in) for its options;
 * Stalwart then checks the browser's answer against its challenge. Rights: sysPasskey*, in the
 * default User role of a new server; an updated one gets them with
 * STALWART_UPDATE_ROLE_PERMISSIONS (CHANGELOG.md of Stalwart, 1.1.0).
 */
import type { CreationOptionsJson, RegistrationJson } from "@/lib/webauthn";
import { assertSetOk, CAPABILITIES, type JmapClient, type JmapError } from "./client";

const STALWART = [CAPABILITIES.core, CAPABILITIES.stalwart];

export type Passkey = { id: string; description: string; createdAt: string };

/** The newest first. */
export const listPasskeys = async (client: JmapClient): Promise<Passkey[]> => {
  const { list } = await client.call<{ list: Passkey[] }>(
    "x:Passkey/get",
    { ids: null, properties: ["description", "createdAt"] },
    STALWART,
  );
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export type OptionsResult =
  | { status: "ok"; publicKey: CreationOptionsJson }
  | { status: "wrong-password" }
  /** Stalwart's own words: no rights, the limit reached, an account from an external directory. */
  | { status: "refused"; reason: string };

/** Stalwart's refusals that mean the password or code was wrong (passkey.rs). */
const WRONG_SECRET = ["Current secret is incorrect.", "Current OTP code is required"];

export const passkeyOptions = async (
  client: JmapClient,
  current: string,
  code?: string,
): Promise<OptionsResult> => {
  try {
    const { publicKey } = await client.call<{ publicKey: CreationOptionsJson }>(
      "x:Passkey/registrationOptions",
      { currentSecret: current, ...(code ? { otpCode: code } : {}) },
      STALWART,
    );
    return { status: "ok", publicKey };
  } catch (error) {
    const { type, message } = error as JmapError;
    if (type !== "forbidden") throw error;
    return WRONG_SECRET.some((text) => message.includes(text))
      ? { status: "wrong-password" }
      : { status: "refused", reason: message };
  }
};

export const createPasskey = async (
  client: JmapClient,
  description: string,
  registration: RegistrationJson,
) =>
  assertSetOk(
    await client.call("x:Passkey/set", { create: { p: { description, registration } } }, STALWART),
    "Passkey",
  );

export const renamePasskey = async (client: JmapClient, id: string, description: string) =>
  assertSetOk(
    await client.call("x:Passkey/set", { update: { [id]: { description } } }, STALWART),
    "Passkey",
  );

export const deletePasskey = async (client: JmapClient, id: string) =>
  assertSetOk(await client.call("x:Passkey/set", { destroy: [id] }, STALWART), "Passkey");
