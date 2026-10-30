/**
 * Sound for the demo's players: an <audio> or <video> loads its `src` itself, past the demo's
 * fetch, so a voicemail at /api/... would ask the network and stay silent. Each such element gets
 * the demo server's answer instead, as a blob URL, once per address.
 */
type Handle = (request: Request) => Promise<Response | null>;

const SELECTOR = 'audio[src^="/api/"], video[src^="/api/"]';

export const serveMedia = (handle: Handle, origin: string, root: Node = document) => {
  const urls = new Map<string, Promise<string | null>>();
  const blobUrl = async (path: string) => {
    const response = await handle(new Request(new URL(path, origin)));
    return response?.ok ? URL.createObjectURL(await response.blob()) : null;
  };
  const serve = async (element: HTMLMediaElement) => {
    const path = element.getAttribute("src");
    if (!path?.startsWith("/api/")) return;
    if (!urls.has(path)) urls.set(path, blobUrl(path));
    const url = await urls.get(path);
    // Only if it still points there: React may have moved it on meanwhile.
    if (url && element.getAttribute("src") === path) element.src = url;
  };
  const serveWithin = (node: Node) => {
    if (!(node instanceof Element)) return;
    if (node.matches(SELECTOR)) void serve(node as HTMLMediaElement);
    for (const element of node.querySelectorAll<HTMLMediaElement>(SELECTOR)) void serve(element);
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") serveWithin(record.target);
      for (const node of record.addedNodes) serveWithin(node);
    }
  });
  observer.observe(root, { subtree: true, childList: true, attributeFilter: ["src"] });
  serveWithin(root instanceof Document ? root.documentElement : root);
  return () => observer.disconnect();
};
