/**
 * Kontext's service worker, built by vite-plugin-pwa (injectManifest) with Workbox:
 * - the app shell (HTML, scripts, styles, fonts, icons) is precached under the content hashes of
 *   this build; a new build is a new worker, and Workbox removes what the old one cached;
 * - a new version waits until the app says so (the "Neu laden" banner, src/pwa/), so an open mail
 *   being written is never swapped out under the user's hands;
 * - mail data (/jmap) and sign-in (/api) never touch a cache;
 * - shared files and texts (Web Share Target) are kept for the composer, and a click on a
 *   notification opens what it is about;
 * - pushes from Kontext's server (chat messages to oneself, new mail) become notifications –
 *   unless Kontext is open in front, where the app shows them itself.
 */
import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  type PrecacheEntry,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { subscribeToPush } from "../pwa/push";
import { SHARE_CACHE, SHARE_PATH, shareKey } from "../pwa/share-cache";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | PrecacheEntry)[];
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Every page of the app is the cached index.html; the server's own paths are not pages.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/jmap/, /^\/api/, new RegExp(`^${SHARE_PATH}`)],
  }),
);

// The app asks for the waiting version to take over (src/pwa/pwa-status.tsx).
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});
clientsClaim();

/** Shared from another app: kept in a cache until the composer picks it up. */
const receiveShare = async (request: Request): Promise<Response> => {
  const form = await request.formData();
  const id = crypto.randomUUID();
  const cache = await caches.open(SHARE_CACHE);
  const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
  await Promise.all(
    files.map((file, index) =>
      cache.put(
        shareKey(id, String(index)),
        new Response(file, {
          headers: {
            "content-type": file.type || "application/octet-stream",
            "x-file-name": encodeURIComponent(file.name),
          },
        }),
      ),
    ),
  );
  const text = (name: string) => String(form.get(name) ?? "");
  await cache.put(
    shareKey(id, "meta"),
    Response.json({
      title: text("title"),
      text: text("text"),
      url: text("url"),
      files: files.length,
    }),
  );
  return Response.redirect(`/compose?shared=${id}`, 303);
};

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === SHARE_PATH) {
    event.respondWith(receiveShare(event.request));
  }
});

/** A click on a notification: an open Kontext goes there, otherwise a new window opens. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = String(event.notification.data?.url ?? "/mail");
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        open.postMessage({ type: "navigate", url: target });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

type Notice = { title: string; body: string; url: string; tag: string };

self.addEventListener("push", (event) => {
  const notice = event.data?.json() as Notice | undefined;
  if (!notice) return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // In front, the app shows it in place; a system notification would only interrupt.
      if (windows.some((client) => client.visibilityState === "visible" && client.focused)) return;
      await self.registration.showNotification(notice.title, {
        body: notice.body,
        tag: notice.tag,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: notice.url },
      });
    })(),
  );
});

// The browser renewed the subscription (keys expire): tell the server the new one.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(subscribeToPush(self.registration).catch(() => undefined));
});
