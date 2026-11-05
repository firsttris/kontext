/**
 * The assistant in the chat (server/assistant/): whether the server has one, and asking it. The
 * conversation lives in the app only; the server keeps nothing between questions.
 */
import { useQuery } from "@tanstack/react-query";

export type Turn = { role: "user" | "assistant"; text: string };

/** An answer: the text, what was created ("Entwurf an … liegt …"), whether it was cut short. */
export type Answer = { text: string; done: string[]; incomplete: boolean };

/** Why a question got no answer: asked too often, or the assistant or the server failed. */
export type AskFailure = "too-many" | "failed";

export type Asked = { ok: true; answer: Answer } | { ok: false; failure: AskFailure };

/** The id the chat's URL uses for the assistant, beside the channels' ids. */
export const ASSISTANT_ID = "assistant";

export const getAssistantEnabled = async (): Promise<boolean> => {
  const response = await fetch("/api/assistant", { credentials: "same-origin" });
  if (!response.ok) return false;
  return ((await response.json()) as { enabled: boolean }).enabled;
};

/** Whether there is an assistant; false until known. */
export const useAssistantEnabled = (): boolean =>
  useQuery({
    queryKey: ["assistant"],
    queryFn: getAssistantEnabled,
    staleTime: 30 * 60_000,
    retry: false,
  }).data ?? false;

export const askAssistant = async (messages: Turn[]): Promise<Asked> => {
  const response = await fetch("/api/assistant", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages }),
  }).catch(() => null);
  if (!response?.ok) {
    return { ok: false, failure: response?.status === 429 ? "too-many" : "failed" };
  }
  return { ok: true, answer: (await response.json()) as Answer };
};
