/**
 * The Firmenverwaltung's telephony data (/api/company/phone) and how its cards change it: each
 * change saves, then the settings and the phone state are loaded again.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import type { BoxRow } from "../../../../server/phone/store";
import { PHONE_KEY } from "../queries";

export type Admin = {
  boxes: (BoxRow & { online: boolean })[];
  line: { registrar: string; username: string; hasPassword: boolean } | null;
  ring: string[];
  callbackBoard: string | null;
  sounds: { id: string; name: string; seconds: number }[];
  mailbox: {
    enabled: boolean;
    ringSeconds: number;
    greeting: string | null;
    deliverTo: string | null;
  };
  sip: { ok: true } | { ok: false; error: string };
};

export const ADMIN_KEY = ["company", "phone"];

export const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/company/phone${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

export const useAdminChange = <T>(change: (value: T) => Promise<unknown>) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: change,
    onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ADMIN_KEY });
      await queryClient.invalidateQueries({ queryKey: PHONE_KEY });
    },
  });
};
