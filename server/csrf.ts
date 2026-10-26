/**
 * Requests that change something with the session cookie must come from Kontext's own pages.
 * SameSite=Lax alone lets a sister site (dokumente.firma.de, the company's website) send a POST
 * with the cookie, and the routes read JSON whatever its Content-Type – a no-cors `fetch` with a
 * text/plain body would do. Browsers name the sender (Sec-Fetch-Site, Origin); requests without
 * either come from no browser and carry no one's cookie by accident.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Paths with their own sign-in, not the cookie: Better Auth (checks origins itself), agents and
 * CalDAV (bearer and basic), the telephone box (its token), LiveKit's webhook (signed).
 */
const OWN_SIGN_IN = ["/api/auth/", "/mcp", "/dav", "/api/phone/box", "/api/calls/webhook"];

const exempt = (pathname: string) =>
  OWN_SIGN_IN.some(
    (path) => pathname === path || pathname.startsWith(path.endsWith("/") ? path : `${path}/`),
  );

/** Whether a request may go on: false for one that changes something and comes from elsewhere. */
export const fromOwnPage = (request: Request, appOrigin: string): boolean => {
  if (SAFE_METHODS.has(request.method)) return true;
  if (exempt(new URL(request.url).pathname)) return true;
  // The browser's own judgement first; the Origin only where it does not send one (older ones).
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const origin = request.headers.get("origin");
  return !origin || origin === appOrigin;
};
