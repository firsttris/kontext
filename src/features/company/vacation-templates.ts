/**
 * The Vorlagen for the out-of-office reply in the app: what the server keeps
 * (server/company/vacation-templates.ts), read by everyone's out-of-office form and changed by
 * the Firmenverwaltung.
 */
import { useQuery } from "@tanstack/react-query";
import type { VacationTemplate } from "@/lib/vacation-template";

export const VACATION_TEMPLATES_KEY = ["company", "vacation-templates"];

const PATH = "/api/company/vacation-templates";

/** None where the server has none, or no Firmenverwaltung at all: then there is no picker. */
export const getVacationTemplates = async (): Promise<VacationTemplate[]> => {
  const response = await fetch(PATH, { credentials: "same-origin" });
  if (!response.ok) return [];
  return ((await response.json()) as { templates: VacationTemplate[] }).templates;
};

export const saveVacationTemplates = async (
  templates: VacationTemplate[],
): Promise<VacationTemplate[]> => {
  const response = await fetch(PATH, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ templates }),
  });
  const result = (await response.json().catch(() => ({}))) as {
    templates?: VacationTemplate[];
    error?: string;
  };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result.templates ?? [];
};

export const useVacationTemplates = (): VacationTemplate[] =>
  useQuery({ queryKey: VACATION_TEMPLATES_KEY, queryFn: getVacationTemplates, retry: false })
    .data ?? [];
