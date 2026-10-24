/**
 * A small Microsoft Graph client for the move: app-only token (client credentials,
 * https://learn.microsoft.com/entra/identity-platform/v2-oauth2-client-creds-grant-flow), paged
 * GETs (@odata.nextLink) and waiting when Graph throttles (429 with Retry-After).
 */

export type M365Credentials = { tenantId: string; clientId: string; clientSecret: string };
export type GraphUrls = { login: string; graph: string };

export const MICROSOFT: GraphUrls = {
  login: "https://login.microsoftonline.com",
  graph: "https://graph.microsoft.com/v1.0",
};

/** German local times for calendar reads (Graph uses Windows zone names here). */
export const GERMAN_TIME = 'outlook.timezone="W. Europe Standard Time"';

type Page<T> = { value: T[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const createGraph = (
  credentials: M365Credentials,
  urls: GraphUrls = MICROSOFT,
  fetchFn: typeof fetch = fetch,
) => {
  let token: { value: string; until: number } | null = null;

  /** A token for the app; null or Microsoft's reason when the credentials are wrong. */
  const authorize = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    const response = await fetchFn(
      `${urls.login}/${encodeURIComponent(credentials.tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      },
    );
    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (!response.ok || !body.access_token) {
      return { ok: false, error: body.error_description?.split("\r\n")[0] ?? `${response.status}` };
    }
    token = {
      value: body.access_token,
      until: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000,
    };
    return { ok: true };
  };

  const send = async (url: string, prefer?: string): Promise<Response> => {
    for (let attempt = 0; ; attempt++) {
      if (!token || token.until < Date.now()) {
        const authorized = await authorize();
        if (!authorized.ok) throw new Error(`Microsoft-Anmeldung: ${authorized.error}`);
      }
      const response = await fetchFn(url.startsWith("http") ? url : `${urls.graph}${url}`, {
        headers: { authorization: `Bearer ${token!.value}`, ...(prefer ? { prefer } : {}) },
      });
      // Graph throttles busy tenants; it says how long to wait (at most a few minutes here).
      if ((response.status === 429 || response.status === 503) && attempt < 5) {
        const wait = Number(response.headers.get("retry-after") ?? "10");
        await sleep(Math.min(wait, 300) * 1000);
        continue;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(`Microsoft Graph ${response.status}: ${body.error?.message ?? url}`);
      }
      return response;
    }
  };

  const get = async <T>(url: string, prefer?: string): Promise<T> =>
    (await (await send(url, prefer)).json()) as T;

  /** All pages of a list; for a delta query also the link for the next run. */
  const all = async <T>(url: string, prefer?: string) => {
    const items: T[] = [];
    let next: string | undefined = url;
    let deltaLink: string | undefined;
    while (next) {
      const page: Page<T> = await get<Page<T>>(next, prefer);
      items.push(...page.value);
      next = page["@odata.nextLink"];
      deltaLink = page["@odata.deltaLink"] ?? deltaLink;
    }
    return { items, deltaLink };
  };

  /** The raw message (MIME), for Email/import. */
  const mime = async (user: string, messageId: string): Promise<Uint8Array> =>
    new Uint8Array(
      await (
        await send(
          `/users/${encodeURIComponent(user)}/messages/${encodeURIComponent(messageId)}/$value`,
        )
      ).arrayBuffer(),
    );

  return { authorize, get, all, mime };
};

export type Graph = ReturnType<typeof createGraph>;
