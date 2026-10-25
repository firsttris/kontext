/**
 * Mail providers a move can come from, with their servers: over IMAP, except Microsoft 365. Gmail
 * first: it is the most common; the German ones because small businesses often started there.
 */
export type ProviderId =
  | "gmail"
  | "m365"
  | "gmx"
  | "webde"
  | "t-online"
  | "ionos"
  | "strato"
  | "1und1"
  | "other";

export type Provider = { id: ProviderId; name: string; host: string; port: number };

export const PROVIDERS: Provider[] = [
  { id: "gmail", name: "Gmail / Google Mail", host: "imap.gmail.com", port: 993 },
  // Not IMAP: Microsoft Graph with the company's app (server/migration/m365).
  {
    id: "m365",
    name: "Microsoft 365 (Outlook, Exchange Online)",
    host: "graph.microsoft.com",
    port: 443,
  },
  { id: "gmx", name: "GMX", host: "imap.gmx.net", port: 993 },
  { id: "webde", name: "WEB.DE", host: "imap.web.de", port: 993 },
  { id: "t-online", name: "Telekom (T-Online)", host: "secureimap.t-online.de", port: 993 },
  { id: "ionos", name: "IONOS", host: "imap.ionos.de", port: 993 },
  { id: "strato", name: "STRATO", host: "imap.strato.de", port: 993 },
  { id: "1und1", name: "1&1", host: "imap.1und1.de", port: 993 },
  { id: "other", name: "Anderer Server", host: "", port: 993 },
];

export type Endpoint = { host: string; port: number };

/**
 * The server to connect to; for "other" the given host on an IMAP port only (143 with STARTTLS
 * or 993), so the Firmenverwaltung cannot be used to probe other services.
 */
export const endpointFor = (
  provider: ProviderId,
  custom: Partial<Endpoint>,
  allowAnyPort = false,
): Endpoint | null => {
  const preset = PROVIDERS.find((p) => p.id === provider);
  if (!preset) return null;
  if (provider !== "other") return { host: preset.host, port: preset.port };
  const host = custom.host?.trim().toLowerCase() ?? "";
  const port = custom.port ?? 993;
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  if (!allowAnyPort && port !== 993 && port !== 143) return null;
  return { host, port };
};
