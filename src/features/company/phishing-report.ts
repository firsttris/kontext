/**
 * Als Phishing melden in the app: the address the server keeps (server/company/phishing-report.ts),
 * read by every signed-in user's mail app and changed by the Firmenverwaltung.
 */
import { useQuery } from "@tanstack/react-query";

export const PHISHING_REPORT_KEY = ["company", "phishing-report"];

/** "" where none is set, or where the server has no Firmenverwaltung at all. */
export const getPhishingReport = async (): Promise<string> => {
  const response = await fetch("/api/company/phishing-report", { credentials: "same-origin" });
  if (!response.ok) return "";
  return ((await response.json()) as { address: string }).address;
};

export const savePhishingReport = async (address: string): Promise<void> => {
  const response = await fetch("/api/company/phishing-report", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (response.ok) return;
  const { error } = (await response.json().catch(() => ({}))) as { error?: string };
  throw new Error(error ?? String(response.status));
};

/** The address; "" until known or while there is none. */
export const usePhishingReport = (): string =>
  useQuery({
    queryKey: PHISHING_REPORT_KEY,
    queryFn: getPhishingReport,
    staleTime: 5 * 60_000,
    retry: false,
  }).data ?? "";
