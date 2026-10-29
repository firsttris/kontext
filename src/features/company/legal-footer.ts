/**
 * The Pflichtangaben in the app: what the server keeps (server/company/legal-footer.ts), read by
 * every signed-in user's composer and changed by the Firmenverwaltung.
 */
import { useQuery } from "@tanstack/react-query";

export const LEGAL_FOOTER_KEY = ["company", "legal-footer"];

/** Empty where the server has none, or no Firmenverwaltung at all: then nothing is added. */
export const getLegalFooter = async (): Promise<string> => {
  const response = await fetch("/api/company/legal-footer", { credentials: "same-origin" });
  if (!response.ok) return "";
  return ((await response.json()) as { text: string }).text;
};

export const saveLegalFooter = async (text: string): Promise<string> => {
  const response = await fetch("/api/company/legal-footer", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const result = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result.text ?? "";
};

/** The footer as the composer shows it and sends it; "" until known or while there is none. */
export const useLegalFooter = (): string =>
  useQuery({
    queryKey: LEGAL_FOOTER_KEY,
    queryFn: getLegalFooter,
    staleTime: 5 * 60_000,
    retry: false,
  }).data ?? "";
