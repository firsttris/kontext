/**
 * The demo's stand-in for the Kontext server and Stalwart behind it: takes the app's requests to
 * /jmap and /api and answers them from the store in the browser.
 */
import { handleApi } from "./api";
import { handleRequest, sessionOf } from "./jmap";
import { json } from "./respond";
import { releaseDue } from "./sending";
import { newId, type Store } from "./store";

/** Whom to tell of a change: the open push streams (RFC 8620 §7.3). */
type Listeners = Set<(state: string) => void>;

/** A push stream that stays open and sends a StateChange after every change. */
const eventSource = (store: Store, listeners: Listeners, signal: AbortSignal | null) => {
  const encoder = new TextEncoder();
  let listener: ((state: string) => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      listener = (state) => {
        const changed = Object.fromEntries(
          store.accounts.map((account) => [account.id, { Email: state, Mailbox: state }]),
        );
        const data = JSON.stringify({ "@type": "StateChange", changed });
        controller.enqueue(encoder.encode(`event: state\ndata: ${data}\n\n`));
      };
      listeners.add(listener);
      signal?.addEventListener("abort", () => {
        if (listener) listeners.delete(listener);
        controller.close();
      });
    },
    cancel: () => {
      if (listener) listeners.delete(listener);
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream" } });
};

const upload = async (store: Store, request: Request) => {
  const blob = await request.blob();
  const blobId = newId(store, "blob-upload-");
  const type = request.headers.get("content-type") ?? "application/octet-stream";
  store.blobs.set(blobId, new Blob([blob], { type }));
  return json({ blobId, type, size: blob.size });
};

const download = (store: Store, path: string) => {
  const [, , , , blobId] = path.split("/");
  const blob = store.blobs.get(decodeURIComponent(blobId ?? ""));
  return blob
    ? new Response(blob, { headers: { "content-type": blob.type } })
    : json({ type: "notFound" }, 404);
};

/** How often held mails are looked at: "Rückgängig" holds a few seconds. */
const RELEASE_MS = 1000;

export const createDemoServer = (store: Store, origin: string) => {
  const listeners: Listeners = new Set();
  const notify = (before: number) => {
    if (store.state === before) return;
    for (const listener of listeners) listener(String(store.state));
  };
  setInterval(() => {
    const before = store.state;
    releaseDue(store);
    notify(before);
  }, RELEASE_MS);

  const jmap = async (request: Request, path: string): Promise<Response> => {
    if (!store.user) return json({ type: "unauthorized" }, 401);
    if (path === "/jmap/session") return json(sessionOf(store, origin));
    if (path.startsWith("/jmap/eventsource")) return eventSource(store, listeners, request.signal);
    if (path.startsWith("/jmap/download/")) return download(store, path);
    if (path.startsWith("/jmap/upload/")) return upload(store, request);
    const before = store.state;
    const response = json(handleRequest(store, await request.json()));
    notify(before);
    return response;
  };

  /** Answers a request to /jmap or /api; anything else is not the demo's. */
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    if (url.origin !== origin) return null;
    if (url.pathname.startsWith("/jmap")) return jmap(request, url.pathname);
    if (url.pathname.startsWith("/api/")) return handleApi(store, request, url);
    return null;
  };
};
