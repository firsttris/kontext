/**
 * Which Kontext this is: the app as loaded on this device and the server it talks to. Usually the
 * same, so one line. After an update on the server the service worker still holds the old app
 * until "Neu laden" (src/pwa/pwa-status.tsx); then both show, and the worker looks for the new one
 * right away, so the banner follows without waiting for the hourly check.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { m } from "@/paraglide/messages";
import { version } from "../../../package.json";

const fetchServerVersion = async (): Promise<string | null> => {
  const response = await fetch("/api/version", { credentials: "same-origin" });
  if (!response.ok) return null;
  return ((await response.json()) as { version: string }).version;
};

const checkForUpdate = () => {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker
    .getRegistration()
    .then((registration) => registration?.update())
    .catch(() => undefined);
};

export const VersionRow = () => {
  const { data: server } = useQuery({ queryKey: ["version"], queryFn: fetchServerVersion });
  const behind = Boolean(server) && server !== version;
  useEffect(() => {
    if (behind) checkForUpdate();
  }, [behind]);

  return (
    <div className="flex flex-col gap-1 border-t border-border pt-4 text-[13px] text-muted">
      <span>{m.pwa_version({ version })}</span>
      {behind && server ? <span>{m.pwa_version_server({ version: server })}</span> : null}
    </div>
  );
};
