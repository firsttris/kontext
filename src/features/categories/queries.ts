/**
 * The categories of every mail account the person can open (/api/categories, Kontext's server)
 * and changing those of one account. Setting one on a mail is a keyword (mail/queries.ts).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Category } from "@/lib/categories";

const KEY = ["categories"];

const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/categories${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

/** By account id; a colleague's change shows up when the window is focused again. */
export const useCategoryMap = (): Record<string, Category[]> =>
  useQuery({
    queryKey: KEY,
    queryFn: () => send<Record<string, Category[]>>("GET", ""),
    staleTime: 60_000,
  }).data ?? {};

export const useCategories = (accountId: string | undefined): Category[] =>
  useCategoryMap()[accountId ?? ""] ?? [];

export const useSaveCategories = (accountId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categories: Category[]) =>
      send<{ ok: true }>("PUT", `/${encodeURIComponent(accountId)}`, { categories }),
    onMutate: (categories) =>
      queryClient.setQueryData<Record<string, Category[]>>(KEY, (map) => ({
        ...map,
        [accountId]: categories,
      })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
};
