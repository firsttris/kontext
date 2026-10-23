/**
 * The user's own settings: name, password and two-factor sign-in (Stalwart's x:AccountSettings
 * and x:AccountPassword singletons, crates/jmap/src/registry/mapping/account.rs), the
 * out-of-office reply (RFC 8621 VacationResponse) and sender names and signatures (Identity).
 */
import { assertSetOk, CAPABILITIES, type JmapClient } from "./client";

const STALWART = [CAPABILITIES.core, CAPABILITIES.stalwart];
const VACATION = [CAPABILITIES.core, "urn:ietf:params:jmap:vacationresponse"];
const SUBMISSION = [CAPABILITIES.core, CAPABILITIES.mail, CAPABILITIES.submission];

export type AccountSettings = {
  description: string | null;
  locale: string;
  timeZone: string | null;
};

export const getAccountSettings = async (client: JmapClient): Promise<AccountSettings> => {
  const { list } = await client.call<{ list: AccountSettings[] }>(
    "x:AccountSettings/get",
    { ids: null },
    STALWART,
  );
  return list[0]!;
};

export const updateAccountSettings = async (client: JmapClient, patch: Partial<AccountSettings>) =>
  assertSetOk(
    await client.call("x:AccountSettings/set", { update: { singleton: patch } }, STALWART),
    "Einstellungen",
  );

/** Whether the account signs in with a second factor. */
export const hasTwoFactor = async (client: JmapClient): Promise<boolean> => {
  const { list } = await client.call<{ list: { otpAuth: { otpUrl?: string | null } }[] }>(
    "x:AccountPassword/get",
    { ids: null },
    STALWART,
  );
  return Boolean(list[0]?.otpAuth?.otpUrl);
};

type PasswordResult = "ok" | "wrong-password" | "rejected";

const setPassword = async (
  client: JmapClient,
  patch: Record<string, unknown>,
): Promise<PasswordResult> => {
  const result = await client.call<{
    notUpdated?: Record<string, { type: string; description?: string }>;
  }>("x:AccountPassword/set", { update: { singleton: patch } }, STALWART);
  const error = result.notUpdated?.singleton;
  if (!error) return "ok";
  if (error.type === "forbidden") return "wrong-password";
  throw new Error(error.description ?? error.type);
};

/**
 * Stalwart checks the current password (and, with two-factor sign-in, the current code) and the
 * strength of the new one. It ends all sessions afterwards, so the caller signs in again.
 */
export const changePassword = (client: JmapClient, current: string, next: string, code?: string) =>
  setPassword(client, {
    currentSecret: current,
    secret: next,
    ...(code ? { otpAuth: { otpCode: code } } : {}),
  });

export const enableTwoFactor = (
  client: JmapClient,
  current: string,
  otpUrl: string,
  code: string,
) => setPassword(client, { currentSecret: current, otpAuth: { otpUrl, otpCode: code } });

/** Turning it off needs the password and a current code. */
export const disableTwoFactor = (client: JmapClient, current: string, code: string) =>
  setPassword(client, { currentSecret: current, otpAuth: { otpCode: code, otpUrl: null } });

export type Vacation = {
  isEnabled: boolean;
  fromDate: string | null;
  toDate: string | null;
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
};

export const getVacation = async (client: JmapClient, accountId: string): Promise<Vacation> => {
  const { list } = await client.call<{ list: Vacation[] }>(
    "VacationResponse/get",
    { accountId },
    VACATION,
  );
  return list[0]!;
};

export const setVacation = async (client: JmapClient, accountId: string, vacation: Vacation) =>
  assertSetOk(
    await client.call(
      "VacationResponse/set",
      { accountId, update: { singleton: vacation } },
      VACATION,
    ),
    "Abwesenheit",
  );

export const updateIdentity = async (
  client: JmapClient,
  accountId: string,
  id: string,
  patch: { name?: string; htmlSignature?: string; textSignature?: string },
) =>
  assertSetOk(
    await client.call("Identity/set", { accountId, update: { [id]: patch } }, SUBMISSION),
    "Absender",
  );
