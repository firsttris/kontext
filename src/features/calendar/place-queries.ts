/**
 * Place suggestions for the "Ort" field from Kontext's server (/api/places, which asks Photon),
 * once the typing pauses; a failed answer is no suggestion, the field stays plain text.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MIN_QUERY, type Place } from "../../../server/places/places";

export type { Place };

const PAUSE_MS = 300;

/** The value once it has not changed for a moment. */
export const useSettled = <T>(value: T, ms = PAUSE_MS): T => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
};

const fetchPlaces = async (query: string, signal: AbortSignal): Promise<Place[]> => {
  const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`, {
    credentials: "same-origin",
    signal,
  }).catch(() => null);
  if (!response?.ok) return [];
  const answer = (await response.json().catch(() => null)) as { places?: Place[] } | null;
  return answer?.places ?? [];
};

/** Places for what was typed; none for short text or while `off`. */
export const usePlaceSuggestions = (text: string, off = false): Place[] => {
  const query = useSettled(text.trim());
  const { data } = useQuery({
    queryKey: ["places", query],
    queryFn: ({ signal }) => fetchPlaces(query, signal),
    enabled: !off && query.length >= MIN_QUERY,
    staleTime: 10 * 60_000,
  });
  return off || query.length < MIN_QUERY ? [] : (data ?? []);
};
