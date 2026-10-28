/**
 * The service worker from the app's side: registered once, asked for a new version every hour
 * and whenever Kontext comes back to the front; a new version is offered as "Neu laden", never
 * swapped in by itself. Also says when the device is offline, and opens what a clicked
 * notification is about.
 */

import { useRegisterSW } from "virtual:pwa-register/react";
import { useNavigate } from "@tanstack/react-router";
import { RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";
import { activateUpdate, browserUpdateDeps } from "./activate-update";

const HOUR = 60 * 60 * 1000;

const subscribeOnline = (listener: () => void) => {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
};

export const useOnline = (): boolean =>
  useSyncExternalStore(subscribeOnline, () => navigator.onLine);

/** Checks for a new version now and then, and when the app is looked at again. */
const watchForUpdates = (registration: ServiceWorkerRegistration) => {
  const check = () => {
    if (navigator.onLine) void registration.update().catch(() => undefined);
  };
  window.setInterval(check, HOUR);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
};

/** The worker asks the app to open a page (a clicked notification). */
const useWorkerNavigation = () => {
  const navigate = useNavigate();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "navigate" && typeof event.data.url === "string") {
        void navigate({ href: event.data.url });
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);
};

const Banner = ({ children }: { children: React.ReactNode }) => (
  <div
    role="status"
    className="fixed inset-x-3 bottom-[calc(5rem+var(--keyboard-height,0px))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border bg-bg px-4 py-3 text-[14px] shadow-lg md:bottom-[calc(1rem+var(--keyboard-height,0px))]"
  >
    {children}
  </div>
);

export const PwaStatus = () => {
  const online = useOnline();
  useWorkerNavigation();
  const {
    needRefresh: [needRefresh],
  } = useRegisterSW({
    // Only the built app has a worker (devOptions off in vite.config.ts), so dev reloads stay plain.
    immediate: true,
    onRegisteredSW: (_url, registration) => {
      if (registration) watchForUpdates(registration);
    },
  });

  return (
    <>
      {online ? null : (
        <Banner>
          <WifiOff size={16} className="shrink-0 text-muted" />
          <span className="flex-1">{m.pwa_offline()}</span>
        </Banner>
      )}
      {needRefresh ? (
        <Banner>
          <RefreshCw size={16} className="shrink-0 text-accent" />
          <span className="flex-1">{m.pwa_update()}</span>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void activateUpdate(browserUpdateDeps())}
          >
            {m.pwa_reload()}
          </Button>
        </Banner>
      ) : null}
    </>
  );
};
