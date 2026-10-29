/**
 * Abmelden nach Inaktivität in the app: the time the server keeps (server/company/idle-logout.ts),
 * read by every signed-in user's app and changed by the Firmenverwaltung.
 */
import { useQuery } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";

export const IDLE_LOGOUT_KEY = ["company", "idle-logout"];

/** 0 (off) where the server has none, or no Firmenverwaltung at all. */
export const getIdleLogout = async (): Promise<number> => {
  const response = await fetch("/api/company/idle-logout", { credentials: "same-origin" });
  if (!response.ok) return 0;
  return ((await response.json()) as { minutes: number }).minutes;
};

export const saveIdleLogout = async (minutes: number): Promise<number> => {
  const response = await fetch("/api/company/idle-logout", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ minutes }),
  });
  const result = (await response.json().catch(() => ({}))) as { minutes?: number; error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result.minutes ?? 0;
};

/** The time in minutes; 0 until known or while it is off. */
export const useIdleLogout = (): number =>
  useQuery({
    queryKey: IDLE_LOGOUT_KEY,
    queryFn: getIdleLogout,
    staleTime: 5 * 60_000,
    retry: false,
  }).data ?? 0;

/** „Nie (aus)“, „15 Minuten“, „1 Stunde“, „4 Stunden“. */
export const idleChoiceText = (minutes: number): string => {
  if (minutes === 0) return m.company_idle_off();
  if (minutes === 60) return m.company_idle_hour();
  if (minutes % 60 === 0) return m.company_idle_hours({ count: minutes / 60 });
  return m.company_idle_minutes({ count: minutes });
};
