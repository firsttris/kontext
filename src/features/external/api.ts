/**
 * The calls for one's other mailboxes (Gmail, GMX, …) to the Kontext server
 * (/api/external-accounts, server/external/routes.ts), and how they show up as senders.
 */

import type { Identity } from "@/jmap/types";
import type { MailProviderId } from "../../../server/external/providers";
import type { ExternalAccount as Stored } from "../../../server/external/store";

/** An account as the server sends it (no password, no state, dates as text). */
export type ExternalAccount = Omit<
  Stored,
  "secret" | "state" | "createdAt" | "updatedAt" | "lastRunAt"
> & { lastRunAt: string | null };

export type NewExternalAccount = {
  provider: MailProviderId;
  email: string;
  name: string;
  password: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  target: "inbox" | "folder";
  importExisting: boolean;
};

const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/external-accounts${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

/** The accounts, or null on a server without the feature (no Stalwart key). */
export const listExternalAccounts = async (): Promise<ExternalAccount[] | null> => {
  const response = await fetch("/api/external-accounts", { credentials: "same-origin" });
  // Without the route a production server answers with the app's index.html (its fallback).
  const json = response.headers.get("content-type")?.includes("application/json");
  if (response.status === 404 || (response.ok && !json)) return null;
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as ExternalAccount[];
};

export const createExternalAccount = (account: NewExternalAccount) =>
  send<ExternalAccount>("POST", "", account);
export const changeExternalAccount = (id: string, change: { name?: string; password?: string }) =>
  send<{ ok: true }>("PATCH", `/${id}`, change);
export const removeExternalAccount = (id: string) => send<{ ok: true }>("DELETE", `/${id}`);
export const fetchExternalAccount = (id: string) => send<{ ok: true }>("POST", `/${id}/run`);
export const sendThroughExternal = (
  id: string,
  request: { emailId: string; draftsId: string; sentId: string },
) => send<{ ok: true; refused: string[] }>("POST", `/${id}/send`, request);

const PREFIX = "external:";

/** An external account as a sender in the composer; its signature is that of `own`. */
export const externalIdentity = (account: ExternalAccount, own?: Identity): Identity => ({
  id: `${PREFIX}${account.id}`,
  name: account.name,
  email: account.email,
  replyTo: null,
  bcc: null,
  textSignature: own?.textSignature ?? "",
  htmlSignature: own?.htmlSignature ?? "",
});

/** The external account behind a sender, or null for Stalwart's own identities. */
export const externalIdOf = (identity: Pick<Identity, "id">): string | null =>
  identity.id.startsWith(PREFIX) ? identity.id.slice(PREFIX.length) : null;

/**
 * The other mailbox an answer goes out from: the one the original was sent to (To or Cc), so a
 * mail fetched from Gmail is answered as the Gmail address; null when it went elsewhere.
 */
export const replyingExternal = (
  identities: Identity[],
  original: { to?: { email: string }[] | null; cc?: { email: string }[] | null },
): Identity | null => {
  const recipients = new Set(
    [...(original.to ?? []), ...(original.cc ?? [])].map((a) => a.email.trim().toLowerCase()),
  );
  return (
    identities.find(
      (identity) => externalIdOf(identity) && recipients.has(identity.email.toLowerCase()),
    ) ?? null
  );
};
