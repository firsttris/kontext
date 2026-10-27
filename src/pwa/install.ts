/**
 * Installing Kontext as an app on this device, and making it the mail program for mailto:
 * links. Browsers differ: Chromium offers its install prompt (`beforeinstallprompt`), Safari
 * installs through its own menu, and only some browsers take a mailto handler.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Kept from the moment the browser offers it, which can be before the settings are open. */
let offered: InstallPrompt | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    offered = event as InstallPrompt;
    for (const listener of listeners) listener();
  });
  window.addEventListener("appinstalled", () => {
    offered = null;
    for (const listener of listeners) listener();
  });
}

export const isInstalled = (): boolean =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true;

/** iPhone and iPad install through Safari's share menu, without a prompt. */
export const isApple = (): boolean =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);

/**
 * The browser's install dialog, when it offers one; it can be shown once. True if the person
 * installed.
 */
export const useInstallPrompt = (): (() => Promise<boolean>) | null => {
  const available = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => offered !== null,
  );
  return available
    ? async () => {
        const prompt = offered;
        offered = null;
        for (const listener of listeners) listener();
        await prompt?.prompt();
        return (await prompt?.userChoice)?.outcome === "accepted";
      }
    : null;
};

export const canHandleMailto = (): boolean =>
  typeof navigator.registerProtocolHandler === "function";

/** Asks the browser to open mailto: links in Kontext (it asks the user to confirm). */
export const handleMailto = () =>
  navigator.registerProtocolHandler("mailto", `${location.origin}/compose?mailto=%s`);

/** Re-renders when the app gets installed or the display mode changes. */
export const useInstalled = (): boolean => {
  const [installed, setInstalled] = useState(isInstalled);
  useEffect(() => {
    const query = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(isInstalled());
    query.addEventListener("change", update);
    window.addEventListener("appinstalled", update);
    return () => {
      query.removeEventListener("change", update);
      window.removeEventListener("appinstalled", update);
    };
  }, []);
  return installed;
};
