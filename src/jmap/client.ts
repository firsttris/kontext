/**
 * A small JMAP client (RFC 8620) built from functions. It is used by the app in the browser and
 * by the dev scripts under Bun, so it only relies on `fetch`.
 */
import { z } from "zod";

export const CAPABILITIES = {
  core: "urn:ietf:params:jmap:core",
  mail: "urn:ietf:params:jmap:mail",
  submission: "urn:ietf:params:jmap:submission",
  contacts: "urn:ietf:params:jmap:contacts",
  calendars: "urn:ietf:params:jmap:calendars",
  principals: "urn:ietf:params:jmap:principals",
  blob: "urn:ietf:params:jmap:blob",
  contactsParse: "urn:ietf:params:jmap:contacts:parse",
  stalwart: "urn:stalwart:jmap",
} as const;

export const DEFAULT_USING = [
  CAPABILITIES.core,
  CAPABILITIES.mail,
  CAPABILITIES.submission,
  CAPABILITIES.contacts,
  CAPABILITIES.calendars,
];

const sessionSchema = z.object({
  username: z.string(),
  apiUrl: z.string(),
  downloadUrl: z.string(),
  uploadUrl: z.string(),
  eventSourceUrl: z.string(),
  state: z.string(),
  primaryAccounts: z.record(z.string(), z.string()),
  accounts: z.record(
    z.string(),
    z.object({
      name: z.string(),
      isPersonal: z.boolean(),
      isReadOnly: z.boolean(),
      accountCapabilities: z.record(z.string(), z.unknown()),
    }),
  ),
});

export type Session = z.infer<typeof sessionSchema>;

export type Credentials = { username: string; password: string };

/** One method call as JMAP sends it: name, arguments, call id. */
export type Invocation = [string, Record<string, unknown>, string];

export type JmapError = Error & { type: string; status?: number };

export const jmapError = (message: string, type: string, status?: number): JmapError =>
  Object.assign(new Error(message), { name: "JmapError", type, status });

export const isJmapError = (error: unknown): error is JmapError =>
  error instanceof Error && error.name === "JmapError";

export type JmapClient = ReturnType<typeof createJmapClient>;

/**
 * The server announces absolute URLs with its own public host. The app reaches the server through
 * the same origin (Vite proxy in dev, Caddy in production), so only the path of each URL is used.
 */
export const toOrigin = (url: string, origin: string): string =>
  url.replace(/^[a-z]+:\/\/[^/]+/i, origin);

export const fillTemplate = (template: string, values: Record<string, string>): string =>
  template.replace(/\{([a-zA-Z]+)\}/g, (_, key: string) => encodeURIComponent(values[key] ?? ""));

export const basicAuth = ({ username, password }: Credentials): string =>
  `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`${username}:${password}`)))}`;

type ClientOptions = {
  /** Origin of the server, e.g. "http://127.0.0.1:18080"; in the browser the page's own origin. */
  origin: string;
  /**
   * Basic auth straight to Stalwart, for the dev scripts and tests. The app leaves it out: its
   * session cookie goes to the Sekretär server, which adds the Stalwart token.
   */
  credentials?: Credentials;
  /** Called when the server answers 401, e.g. because the session ended. */
  onUnauthorized?: () => void;
  fetch?: typeof fetch;
};

export const createJmapClient = ({
  origin,
  credentials,
  onUnauthorized,
  fetch: baseFetch = fetch,
}: ClientOptions) => {
  const authHeaders: Record<string, string> = credentials
    ? { authorization: basicAuth(credentials) }
    : {};
  let session: Session | undefined;

  const doFetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const response = await baseFetch(input, { credentials: "same-origin", ...init });
    if (response.status === 401) onUnauthorized?.();
    return response;
  };

  const fetchSession = async (): Promise<Session> => {
    const response = await doFetch(`${origin}/jmap/session`, { headers: authHeaders });
    if (response.status === 401) throw jmapError("Anmeldung fehlgeschlagen", "unauthorized", 401);
    if (!response.ok)
      throw jmapError(`Server antwortet nicht (${response.status})`, "network", response.status);
    const raw = sessionSchema.parse(await response.json());
    session = {
      ...raw,
      apiUrl: toOrigin(raw.apiUrl, origin),
      downloadUrl: toOrigin(raw.downloadUrl, origin),
      uploadUrl: toOrigin(raw.uploadUrl, origin),
      eventSourceUrl: toOrigin(raw.eventSourceUrl, origin),
    };
    return session;
  };

  const getSession = async (): Promise<Session> => session ?? fetchSession();

  /** Sends method calls and returns the responses in order; a method-level error throws. */
  const request = async (
    methodCalls: Invocation[],
    using: string[] = DEFAULT_USING,
  ): Promise<Invocation[]> => {
    const { apiUrl } = await getSession();
    const response = await doFetch(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders },
      body: JSON.stringify({ using, methodCalls }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw jmapError(text || response.statusText, "request", response.status);
    }
    const body = (await response.json()) as { methodResponses: Invocation[] };
    for (const [name, result] of body.methodResponses) {
      if (name === "error") {
        throw jmapError(
          String(result.description ?? result.type),
          String(result.type ?? "serverFail"),
        );
      }
    }
    return body.methodResponses;
  };

  /** One method call, returning its arguments. */
  const call = async <T = Record<string, unknown>>(
    name: string,
    args: Record<string, unknown>,
    using?: string[],
  ): Promise<T> => {
    const [first] = await request([[name, args, "0"]], using);
    return first![1] as T;
  };

  const upload = async (accountId: string, data: Blob | string, type: string) => {
    const { uploadUrl } = await getSession();
    const response = await doFetch(fillTemplate(uploadUrl, { accountId }), {
      method: "POST",
      headers: { "content-type": type, ...authHeaders },
      body: data,
    });
    if (!response.ok) throw jmapError(await response.text(), "upload", response.status);
    return (await response.json()) as { blobId: string; size: number; type: string };
  };

  const downloadUrl = async (accountId: string, blobId: string, name: string, type: string) => {
    const { downloadUrl: template } = await getSession();
    return fillTemplate(template, { accountId, blobId, name, type });
  };

  const download = async (accountId: string, blobId: string, name: string, type: string) => {
    const response = await doFetch(await downloadUrl(accountId, blobId, name, type), {
      headers: authHeaders,
    });
    if (!response.ok) throw jmapError(await response.text(), "download", response.status);
    return response.blob();
  };

  return {
    authHeaders,
    fetch: doFetch,
    getSession,
    fetchSession,
    request,
    call,
    upload,
    download,
    downloadUrl,
  };
};

/** Throws when a /set call did not create, update or destroy everything it was asked to. */
export const assertSetOk = (result: Record<string, unknown>, what: string): void => {
  for (const key of ["notCreated", "notUpdated", "notDestroyed"]) {
    const failed = result[key] as Record<string, { type: string; description?: string }> | null;
    if (failed && Object.keys(failed).length > 0) {
      const [id, err] = Object.entries(failed)[0]!;
      throw jmapError(`${what}: ${id} ${err.description ?? err.type}`, err.type);
    }
  }
};
