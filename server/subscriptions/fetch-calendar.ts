/**
 * Fetching a subscribed calendar file. Only https on the internet (internet-host.ts), so a
 * subscription cannot make the server read Stalwart, the cloud's metadata or another machine
 * inside; webcal:// is https. Redirects are followed by hand, each target checked the same way.
 * At most 5 MB and 15 seconds.
 */
import { dnsResolve, isInternetHost, type Resolve } from "../internet-host";

export const MAX_BYTES = 5_000_000;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

export type FetchDeps = {
  fetch?: typeof fetch;
  resolve?: Resolve;
  /** For the tests only: any address, also http and inside. */
  anyTarget?: boolean;
};

export type Fetched = { ok: true; text: string } | { ok: false; error: string };

/** The address as the server reads it: webcal:// becomes https://; null if it is none. */
export const calendarUrl = (input: string): URL | null => {
  try {
    const url = new URL(input.trim().replace(/^webcals?:\/\//i, "https://"));
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
};

const allowed = async (url: URL, deps: FetchDeps) => {
  if (deps.anyTarget) return true;
  if (url.protocol !== "https:" || url.username || url.password) return false;
  return isInternetHost(url.hostname, deps.resolve ?? dnsResolve);
};

/** Reads the body up to the limit; null if it is longer. */
const readLimited = async (response: Response): Promise<string | null> => {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
};

export const fetchCalendar = async (input: string, deps: FetchDeps = {}): Promise<Fetched> => {
  let url = calendarUrl(input);
  if (!url) return { ok: false, error: "Das ist keine Kalender-Adresse." };
  const get = deps.fetch ?? fetch;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await allowed(url, deps))) {
      return { ok: false, error: "Diese Adresse ruft Kontext nicht ab: nur https im Internet." };
    }
    let response: Response;
    try {
      response = await get(url, {
        redirect: "manual",
        headers: { accept: "text/calendar, */*;q=0.5" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { ok: false, error: "Der Kalender ist nicht erreichbar." };
    }
    const next = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && next) {
      url = new URL(next, url);
      continue;
    }
    if (!response.ok) return { ok: false, error: `Der Kalender antwortet mit ${response.status}.` };
    const text = await readLimited(response);
    if (text === null) return { ok: false, error: "Der Kalender ist größer als 5 MB." };
    if (!/^\s*BEGIN:VCALENDAR/i.test(text)) {
      return { ok: false, error: "Unter dieser Adresse liegt kein Kalender (iCal)." };
    }
    return { ok: true, text };
  }
  return { ok: false, error: "Zu viele Weiterleitungen." };
};
