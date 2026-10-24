/**
 * Web Push from the browser's side: subscribe this browser to Kontext's server (with its public
 * key) and tell the server; or the opposite. Used by the app when notifications are switched on,
 * and by the service worker when the browser renews the subscription.
 */

const base64UrlToBytes = (text: string) => {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)), (c) =>
    c.charCodeAt(0),
  );
};

/** The worker is there in the built app only (not in development). */
export const pushRegistration = async (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  if (typeof PushManager === "undefined") return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
};

/** Subscribes (or keeps the subscription) and registers it with the server for this sign-in. */
export const subscribeToPush = async (registration: ServiceWorkerRegistration): Promise<void> => {
  const { publicKey } = (await (await fetch("/api/push/key")).json()) as { publicKey: string };
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    }));
  const response = await fetch("/api/push/subscriptions", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error(`push ${response.status}`);
};

export const unsubscribeFromPush = async (registration: ServiceWorkerRegistration) => {
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await fetch("/api/push/subscriptions", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);
  await subscription.unsubscribe();
};
