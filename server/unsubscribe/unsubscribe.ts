/**
 * Unsubscribing from a newsletter by its List-Unsubscribe header (RFC 2369): with one click
 * (RFC 8058: an https address and "List-Unsubscribe=One-Click"), else by mail, else on the
 * sender's web page. Pure, for the app and the server.
 */
export type UnsubscribeWay =
  | { kind: "one-click"; url: string }
  | { kind: "mail"; to: string; subject: string; body: string }
  | { kind: "web"; url: string };

const ONE_CLICK = /^\s*List-Unsubscribe\s*=\s*One-Click\s*$/i;

/** The best way the header offers, or none. */
export const unsubscribeWay = (
  urls: string[] | null | undefined,
  post: string | null | undefined,
): UnsubscribeWay | null => {
  const list = (urls ?? []).map((url) => url.trim()).filter(Boolean);
  const https = list.find((url) => /^https:\/\//i.test(url));
  if (https && post && ONE_CLICK.test(post)) return { kind: "one-click", url: https };
  const mailto = list.find((url) => /^mailto:/i.test(url));
  if (mailto) {
    const parsed = new URL(mailto);
    return {
      kind: "mail",
      to: decodeURIComponent(parsed.pathname),
      subject: parsed.searchParams.get("subject") || "unsubscribe",
      body: parsed.searchParams.get("body") || "unsubscribe",
    };
  }
  const web = list.find((url) => /^https?:\/\//i.test(url));
  return web ? { kind: "web", url: web } : null;
};
