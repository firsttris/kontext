/**
 * Where an external account sends from: the provider's submission server (RFC 8314: 465 with TLS,
 * or 587 with STARTTLS). Mail "from @gmail.com" must leave through Google's server, else SPF and
 * DMARC fail at the recipient; Kontext's own Stalwart cannot send it.
 */
import { type Endpoint, endpointFor, type ProviderId } from "../migration/providers";

export type MailProviderId = Exclude<ProviderId, "m365">;

const SMTP: Record<Exclude<MailProviderId, "other">, Endpoint> = {
  gmail: { host: "smtp.gmail.com", port: 465 },
  gmx: { host: "mail.gmx.net", port: 465 },
  webde: { host: "smtp.web.de", port: 587 },
  "t-online": { host: "securesmtp.t-online.de", port: 465 },
  ionos: { host: "smtp.ionos.de", port: 465 },
  strato: { host: "smtp.strato.de", port: 465 },
  "1und1": { host: "smtp.1und1.de", port: 587 },
};

/** Providers that put a copy of what was sent through them into their own Sent folder. */
export const KEEPS_SENT_COPY = new Set<MailProviderId>(["gmail"]);

const HOST = /^[a-z0-9.-]+$/;

/**
 * The submission server; for "other" the given host on a submission port only (465 or 587), so
 * the form cannot be used to probe other services.
 */
export const smtpFor = (
  provider: MailProviderId,
  custom: Partial<Endpoint>,
  allowAnyPort = false,
): Endpoint | null => {
  if (provider !== "other") return SMTP[provider] ?? null;
  const host = custom.host?.trim().toLowerCase() ?? "";
  const port = custom.port ?? 465;
  if (!HOST.test(host)) return null;
  if (!allowAnyPort && port !== 465 && port !== 587) return null;
  return { host, port };
};

/** Both servers of an account, or null when one of them is not allowed. */
export const serversFor = (
  provider: MailProviderId,
  imap: Partial<Endpoint>,
  smtp: Partial<Endpoint>,
  allowAnyPort = false,
): { imap: Endpoint; smtp: Endpoint } | null => {
  const incoming = endpointFor(provider, imap, allowAnyPort);
  const outgoing = smtpFor(provider, smtp, allowAnyPort);
  return incoming && outgoing ? { imap: incoming, smtp: outgoing } : null;
};
