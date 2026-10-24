/**
 * Reading the old mailbox over IMAP (RFC 9051) with imapflow: folders, which mails are new since
 * the last run, and their source. Never changes anything there (folders opened read-only).
 */
import { ImapFlow } from "imapflow";
import type { ImapFolder } from "./imap-folders";
import type { Endpoint } from "./providers";

export type Login = { user: string; password: string };

/** Why a connection failed: the login (wrong or revoked app password) or the server. */
export type OpenFailure = { reason: "login" | "server"; message: string };

export type MailHead = {
  uid: number;
  messageId: string | null;
  flags: Set<string>;
  internalDate: Date | null;
  size: number;
};

/**
 * Connects; port 993 with TLS, any other port with STARTTLS. `allowPlain` (tests against the local
 * Stalwart only) also accepts a server without TLS.
 */
export const openImap = async (
  endpoint: Endpoint,
  login: Login,
  allowPlain = false,
): Promise<{ ok: true; value: ImapSource } | { ok: false; error: OpenFailure }> => {
  const client = new ImapFlow({
    host: endpoint.host,
    port: endpoint.port,
    secure: endpoint.port === 993,
    doSTARTTLS: endpoint.port === 993 ? undefined : allowPlain ? undefined : true,
    auth: { user: login.user, pass: login.password },
    logger: false,
    emitLogs: false,
  });
  try {
    await client.connect();
  } catch (error) {
    const refused = Boolean((error as { authenticationFailed?: boolean }).authenticationFailed);
    return {
      ok: false,
      error: {
        reason: refused ? "login" : "server",
        message: refused ? "Anmeldung abgelehnt" : (error as Error).message,
      },
    };
  }
  return { ok: true, value: sourceOf(client) };
};

const sourceOf = (client: ImapFlow) => {
  const folders = async (): Promise<ImapFolder[]> =>
    (await client.list()).map((box) => ({
      path: box.path,
      delimiter: box.delimiter,
      specialUse: box.specialUse || undefined,
      flags: box.flags,
    }));

  /** Opens a folder read-only; its UIDVALIDITY and the UIDs above `after`. */
  const newUids = async (path: string, after: number) => {
    const lock = await client.getMailboxLock(path, { readOnly: true });
    try {
      const uidValidity = String(client.mailbox ? client.mailbox.uidValidity : "");
      const found = await client.search({ uid: `${after + 1}:*` }, { uid: true });
      // "n:*" also returns the highest UID when there is nothing above n (RFC 9051 §6.4.4).
      return {
        uidValidity,
        uids: (found || []).filter((uid) => uid > after).sort((a, b) => a - b),
      };
    } finally {
      lock.release();
    }
  };

  const heads = async (path: string, uids: number[]): Promise<MailHead[]> => {
    const lock = await client.getMailboxLock(path, { readOnly: true });
    try {
      const result: MailHead[] = [];
      for await (const message of client.fetch(
        uids.join(","),
        { uid: true, flags: true, internalDate: true, size: true, envelope: true },
        { uid: true },
      )) {
        result.push({
          uid: message.uid,
          messageId: message.envelope?.messageId?.replace(/^<|>$/g, "") || null,
          flags: message.flags ?? new Set(),
          internalDate: message.internalDate ? new Date(message.internalDate) : null,
          size: message.size ?? 0,
        });
      }
      return result;
    } finally {
      lock.release();
    }
  };

  const sources = async (path: string, uids: number[]): Promise<Map<number, Uint8Array>> => {
    const lock = await client.getMailboxLock(path, { readOnly: true });
    try {
      const result = new Map<number, Uint8Array>();
      for await (const message of client.fetch(
        uids.join(","),
        { uid: true, source: true },
        { uid: true },
      )) {
        if (message.source) result.set(message.uid, new Uint8Array(message.source));
      }
      return result;
    } finally {
      lock.release();
    }
  };

  const close = () => client.logout().catch(() => client.close());

  return { folders, newUids, heads, sources, close };
};

export type ImapSource = ReturnType<typeof sourceOf>;
