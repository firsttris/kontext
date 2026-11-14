/**
 * Stalwart Community or Enterprise, as the server asks Stalwart (server/company/edition.ts). Parts
 * that need an Enterprise license ask `useStalwartEdition` before they offer anything.
 */
import { useQuery } from "@tanstack/react-query";
import type { Edition } from "../../../server/company/edition";

export type { Edition };

export const EDITION_KEY = ["company", "edition"];

/** "unknown" where the server cannot tell, or has no Stalwart key (no /api/company). */
export const getEdition = async (): Promise<Edition> => {
  const response = await fetch("/api/company/edition", { credentials: "same-origin" });
  if (!response.ok) return "unknown";
  return ((await response.json()) as { edition: Edition }).edition;
};

export const useStalwartEdition = (): Edition | undefined =>
  useQuery({
    queryKey: EDITION_KEY,
    queryFn: getEdition,
    staleTime: 10 * 60_000,
    retry: false,
  }).data;
