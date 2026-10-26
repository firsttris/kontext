/**
 * Security headers the server sets itself, so they hold with any proxy in front, not only with the
 * Caddyfile's: the app's Content-Security-Policy, and hardened answers for downloads through the
 * JMAP pass-through.
 */

/** " <origin>" of an address, to add to a source list; "" without one. */
const source = (url?: string) => (url ? ` ${new URL(url).origin}` : "");
/** LiveKit's address may be given as http(s); the browser speaks WebSocket to it. */
const socketSource = (url?: string) => source(url?.replace(/^http/, "ws"));

/** The app's policy; Caddy adds it only where the server sent none (deploy/Caddyfile). */
export const appPolicy = (urls: { schreibzeug?: string; livekit?: string } = {}) =>
  [
    "default-src 'self'",
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline'",
    `frame-src 'self' blob:${source(urls.schreibzeug)}`,
    `connect-src 'self'${socketSource(urls.livekit)}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

/** Sets the app's policy on a page that brings none of its own. */
export const withAppHeaders = (headers: Headers, policy: string): void => {
  if (!(headers.get("content-type") ?? "").startsWith("text/html")) return;
  if (!headers.has("content-security-policy")) headers.set("content-security-policy", policy);
  headers.set("x-content-type-options", "nosniff");
};

const SHOWN = /^(image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)|application\/pdf)$/;

/**
 * A download of a mail's part comes with the type the sender (or the URL's `accept`) gave. Opened
 * directly, or loaded by `<script src>`, it must not count as a page or a script of Kontext: what
 * is not an image or a PDF goes out as bytes, and nothing of it runs.
 */
export const hardenDownload = (headers: Headers): void => {
  const type = (headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!SHOWN.test(type)) headers.set("content-type", "application/octet-stream");
  headers.set("content-security-policy", "sandbox");
  headers.set("x-content-type-options", "nosniff");
  if (!headers.has("content-disposition")) headers.set("content-disposition", "attachment");
};

export const isDownload = (pathname: string) => pathname.startsWith("/jmap/download/");
