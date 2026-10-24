/** Text snippets from Kontext's server (/api/snippets), for all accounts one can open. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Snippet } from "../../../server/snippets/snippets";

export type { Snippet };

const KEY = ["snippets"];

const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/snippets${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

export const useSnippets = () =>
  useQuery({
    queryKey: KEY,
    queryFn: async () => (await send<{ snippets: Snippet[] }>("GET", "")).snippets,
  }).data ?? [];

export const useSnippetActions = () => {
  const queryClient = useQueryClient();
  const settle = () => queryClient.invalidateQueries({ queryKey: KEY });
  return {
    create: useMutation({
      mutationFn: (input: Pick<Snippet, "accountId" | "title" | "body">) =>
        send<{ snippet: Snippet }>("POST", "", input),
      onSettled: settle,
    }),
    update: useMutation({
      mutationFn: ({ id, ...patch }: Pick<Snippet, "id" | "title" | "body">) =>
        send<{ snippet: Snippet }>("PATCH", `/${encodeURIComponent(id)}`, patch),
      onSettled: settle,
    }),
    remove: useMutation({
      mutationFn: (id: string) => send("DELETE", `/${encodeURIComponent(id)}`),
      onSettled: settle,
    }),
  };
};
