/**
 * "Neu laden": lets the waiting worker take over and always loads the page again under it.
 *
 * vite-plugin-pwa's updateServiceWorker reloads only on Workbox's "controlling" event with
 * `isUpdate`, which is false when the page had no controller when it registered: a tab after
 * Ctrl+Shift+R (or a reload with DevTools' "Disable cache") while another tab keeps the new
 * version waiting. The click let the new worker in, nothing reloaded, and every further click
 * found no waiting worker to send to (vite-plugin-pwa 2.0.0 src/client/build/register.ts,
 * workbox-window 7.4 Workbox.ts `_onControllerChange`, `messageSkipWaiting`).
 */

/** What the update needs from the browser, passed in so it can be tested. */
export type UpdateDeps = {
  waiting: () => Promise<{ postMessage: (message: unknown) => void } | null | undefined>;
  onControllerChange: (listener: () => void) => void;
  reload: () => void;
  later: (run: () => void, ms: number) => void;
};

/** If the browser never reports the new controller, load the page anyway after this long. */
export const FALLBACK_MS = 3000;

export const activateUpdate = async (deps: UpdateDeps): Promise<void> => {
  let done = false;
  const reloadOnce = () => {
    if (done) return;
    done = true;
    deps.reload();
  };
  const waiting = await deps.waiting();
  // Already taken over in another tab: this page only has to load again.
  if (!waiting) return reloadOnce();
  deps.onControllerChange(reloadOnce);
  deps.later(reloadOnce, FALLBACK_MS);
  waiting.postMessage({ type: "SKIP_WAITING" });
};

export const browserUpdateDeps = (): UpdateDeps => ({
  waiting: async () => (await navigator.serviceWorker?.getRegistration())?.waiting,
  onControllerChange: (listener) =>
    navigator.serviceWorker?.addEventListener("controllerchange", listener),
  reload: () => window.location.reload(),
  later: (run, ms) => window.setTimeout(run, ms),
});
