/**
 * Hinweis „Extern“ in the app: what the server keeps (server/company/external-hint.ts), read once
 * per few minutes by every signed-in user, and changed by the Firmenverwaltung.
 */
import { useQuery } from "@tanstack/react-query";

export type ExternalHint = {
  enabled: boolean;
  /** The partner domains; they count as inside. */
  partners: string[];
  /** The company's own mail domains. */
  domains: string[];
};

export const EXTERNAL_HINT_KEY = ["company", "external-hint"];

/** Null where the server has no Firmenverwaltung (no Stalwart key): then there is no hint. */
export const getExternalHint = async (): Promise<ExternalHint | null> => {
  const response = await fetch("/api/company/external-hint", { credentials: "same-origin" });
  return response.ok ? ((await response.json()) as ExternalHint) : null;
};

export const saveExternalHint = async (change: {
  enabled: boolean;
  partners: string[];
}): Promise<void> => {
  const response = await fetch("/api/company/external-hint", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(change),
  });
  if (response.ok) return;
  const { error } = (await response.json().catch(() => ({}))) as { error?: string };
  throw new Error(error ?? String(response.status));
};

export const useExternalHint = () =>
  useQuery({
    queryKey: EXTERNAL_HINT_KEY,
    queryFn: getExternalHint,
    staleTime: 5 * 60_000,
    retry: false,
  });

/**
 * The domains that count as inside while the hint is switched on (own and partners); null while
 * it is off or not known yet, so nothing is marked or asked.
 */
export const useInsideDomains = (): string[] | null => {
  const { data } = useExternalHint();
  return data?.enabled ? [...data.domains, ...data.partners] : null;
};
