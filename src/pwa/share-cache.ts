/**
 * Where the service worker keeps what another app shared with Kontext (Web Share Target), and
 * how the app reads it back. One entry per share: its texts as JSON and each file.
 */
export const SHARE_PATH = "/share-target";
export const SHARE_CACHE = "kontext-share";

export const shareKey = (id: string, part: string) => `/shared/${id}/${part}`;

/**
 * Whether a POST to the share target came from the system's share sheet (no referrer) or from
 * Kontext itself – not from a form on another site that fills the composer behind one's back.
 */
export const isShare = (referrer: string, origin: string): boolean => {
  if (!referrer || referrer === "about:client") return true;
  try {
    return new URL(referrer).origin === origin;
  } catch {
    return false;
  }
};

export type SharedItem = { title: string; text: string; url: string; files: File[] };

/** The shared item, taken out of the cache (it is used once); null when it is gone. */
export const takeShared = async (id: string): Promise<SharedItem | null> => {
  if (!("caches" in globalThis)) return null;
  const cache = await caches.open(SHARE_CACHE);
  const meta = await cache.match(shareKey(id, "meta"));
  if (!meta) return null;
  const { title, text, url, files } = (await meta.json()) as {
    title: string;
    text: string;
    url: string;
    files: number;
  };
  const loaded = await Promise.all(
    Array.from({ length: files }, async (_, index) => {
      const response = await cache.match(shareKey(id, String(index)));
      if (!response) return null;
      const name = decodeURIComponent(response.headers.get("x-file-name") ?? `Datei-${index + 1}`);
      return new File([await response.blob()], name, {
        type: response.headers.get("content-type") ?? "application/octet-stream",
      });
    }),
  );
  await Promise.all(
    ["meta", ...Array.from({ length: files }, (_, index) => String(index))].map((part) =>
      cache.delete(shareKey(id, part)),
    ),
  );
  return { title, text, url, files: loaded.filter((file): file is File => file !== null) };
};
