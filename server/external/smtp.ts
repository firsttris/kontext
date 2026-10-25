/**
 * Sending through the provider's submission server (RFC 6409) with nodemailer: port 465 with TLS,
 * any other port with STARTTLS. The mail goes out as Kontext stored it (raw), with an explicit
 * envelope, so nothing is rebuilt on the way.
 */
import nodemailer from "nodemailer";
import type { Login } from "../migration/imap-source";
import type { Endpoint } from "../migration/providers";

export type SmtpFailure = { reason: "login" | "server" | "rejected"; message: string };
export type SmtpResult = { ok: true } | { ok: false; error: SmtpFailure };
/** Sent: `refused` are the recipients the server turned down while taking the others. */
export type SendResult = { ok: true; refused: string[] } | { ok: false; error: SmtpFailure };

export type Envelope = { from: string; to: string[] };

export type Smtp = {
  /** Logs in once to see that server and password work. */
  check: (endpoint: Endpoint, login: Login) => Promise<SmtpResult>;
  send: (
    endpoint: Endpoint,
    login: Login,
    envelope: Envelope,
    raw: Uint8Array,
  ) => Promise<SendResult>;
};

const TIMEOUT_MS = 20_000;

/** Why it failed, in the terms of the form: wrong password, server not reached, mail refused. */
const failureOf = (error: unknown): SmtpFailure => {
  const { code, responseCode, message } = error as {
    code?: string;
    responseCode?: number;
    message?: string;
  };
  if (code === "EAUTH" || responseCode === 535)
    return { reason: "login", message: "Anmeldung abgelehnt" };
  if (code === "EENVELOPE" || code === "EMESSAGE" || (responseCode && responseCode >= 500))
    return { reason: "rejected", message: message ?? "Mail abgelehnt" };
  return { reason: "server", message: message ?? "Server nicht erreichbar" };
};

/** `allowPlain` (tests against a local server only) also accepts a server without TLS. */
export const createSmtp = (allowPlain = false): Smtp => {
  const transportFor = (endpoint: Endpoint, login: Login) =>
    nodemailer.createTransport({
      host: endpoint.host,
      port: endpoint.port,
      secure: endpoint.port === 465,
      requireTLS: endpoint.port !== 465 && !allowPlain,
      auth: { user: login.user, pass: login.password },
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS * 3,
      ...(allowPlain ? { tls: { rejectUnauthorized: false } } : {}),
    });

  const check: Smtp["check"] = async (endpoint, login) => {
    const transport = transportFor(endpoint, login);
    try {
      await transport.verify();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: failureOf(error) };
    } finally {
      transport.close();
    }
  };

  const send: Smtp["send"] = async (endpoint, login, envelope, raw) => {
    const transport = transportFor(endpoint, login);
    try {
      // nodemailer only fails when every recipient is refused; the others it reports here.
      const info = await transport.sendMail({ envelope, raw: Buffer.from(raw) });
      return { ok: true, refused: (info.rejected ?? []).map(String) };
    } catch (error) {
      return { ok: false, error: failureOf(error) };
    } finally {
      transport.close();
    }
  };

  return { check, send };
};
