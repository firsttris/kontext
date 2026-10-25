/**
 * Telephony from Kontext's server (/api/phone): the calls one sees, taking a ringing call,
 * dialling, hanging up and notes. The live connection keeps the list current (features/live).
 */
import { type QueryClient, useQuery } from "@tanstack/react-query";
import { laterCall, type PhoneCall, type RingPlan } from "@/lib/phone";
import { enterPhone } from "./phone-store";

export const PHONE_KEY = ["phone"];

type PhoneData = {
  enabled: boolean;
  allowed: boolean;
  online: boolean;
  /** Who else hears the phone: whom one can hand a call to. */
  colleagues?: string[];
  ringPlan?: RingPlan;
  calls: PhoneCall[];
};
type Ticket = { call: PhoneCall; token: string; url: string | null };

const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/phone${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

/** Telephony for me: whether it is there, whether I may use it, and my calls. */
export const usePhone = () => {
  const { data } = useQuery({
    queryKey: PHONE_KEY,
    queryFn: () => send<PhoneData>("GET", ""),
    staleTime: 60_000,
  });
  return {
    enabled: data?.enabled ?? false,
    allowed: data?.allowed ?? false,
    online: data?.online ?? false,
    colleagues: data?.colleagues ?? [],
    ringPlan: data?.ringPlan ?? null,
    calls: data?.calls ?? [],
  };
};

/** A call changed, as the live connection tells it: newest first. */
export const setPhoneCall = (queryClient: QueryClient, call: PhoneCall) => {
  queryClient.setQueryData<PhoneData>(PHONE_KEY, (data) =>
    data
      ? {
          ...data,
          calls: [
            laterCall(
              data.calls.find((other) => other.id === call.id),
              call,
            ),
            ...data.calls.filter((other) => other.id !== call.id),
          ].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
        }
      : data,
  );
};

const own = () => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;

const enter = (queryClient: QueryClient, { call, token, url }: Ticket) => {
  setPhoneCall(queryClient, call);
  enterPhone({ callId: call.id, token, url: url ?? own() });
};

export const answerPhone = async (queryClient: QueryClient, callId: string) =>
  enter(queryClient, await send<Ticket>("POST", `/calls/${encodeURIComponent(callId)}/answer`));

export const dialPhone = async (queryClient: QueryClient, number: string) =>
  enter(queryClient, await send<Ticket>("POST", "/dial", { number }));

export const hangupPhone = (callId: string) =>
  send<unknown>("POST", `/calls/${encodeURIComponent(callId)}/hangup`).catch(() => undefined);

/** Hand the call on: to a colleague (it rings for them) or a number dialled into the room. */
export const transferPhone = async (
  queryClient: QueryClient,
  callId: string,
  target: { to: string } | { number: string },
) => {
  const { call } = await send<{ call: PhoneCall }>(
    "POST",
    `/calls/${encodeURIComponent(callId)}/transfer`,
    target,
  );
  setPhoneCall(queryClient, call);
};

/** Take the call a colleague hands to me: into its room. */
export const takePhoneTransfer = async (queryClient: QueryClient, callId: string) =>
  enter(
    queryClient,
    await send<Ticket>("POST", `/calls/${encodeURIComponent(callId)}/transfer/take`),
  );

export const cancelPhoneTransfer = async (queryClient: QueryClient, callId: string) => {
  const { call } = await send<{ call: PhoneCall }>(
    "POST",
    `/calls/${encodeURIComponent(callId)}/transfer/cancel`,
  );
  setPhoneCall(queryClient, call);
};

export const savePhoneNote = async (queryClient: QueryClient, callId: string, note: string) => {
  const { call } = await send<{ call: PhoneCall }>(
    "PUT",
    `/calls/${encodeURIComponent(callId)}/note`,
    { note },
  );
  setPhoneCall(queryClient, call);
};
