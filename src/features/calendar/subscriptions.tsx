/**
 * "Kalender abonnieren" in Kalender verwalten: a calendar from an address (iCal, webcal) such as
 * school holidays, the waste collection or a supplier's dates. The Kontext server fetches it and
 * keeps it up to date every six hours (server/subscriptions/). Only where the server has the key.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { LOCALE } from "@/lib/locale";
import { m } from "@/paraglide/messages";
import type { ShownSubscription } from "../../../server/subscriptions/routes";
import { listKey, useCalendarAccountId } from "./queries";

const URL = "/api/calendar-subscriptions";

const send = async <T,>(path: string, method: string, body?: unknown): Promise<T> => {
  const response = await fetch(`${URL}${path}`, {
    method,
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? response.statusText);
  return data as T;
};

/** Null where the server has no Stalwart key: the path falls through to the app's page. */
const loadSubscriptions = async (): Promise<ShownSubscription[] | null> => {
  const response = await fetch(URL, { credentials: "same-origin" });
  const json = response.headers.get("content-type")?.includes("application/json");
  if (response.status === 404 || (response.ok && !json)) return null;
  if (!response.ok) throw new Error(response.statusText);
  return ((await response.json()) as { subscriptions: ShownSubscription[] }).subscriptions;
};

const synced = new Intl.DateTimeFormat(LOCALE, { dateStyle: "short", timeStyle: "short" });

export const Subscriptions = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const accountId = useCalendarAccountId();
  const { data: subscriptions } = useQuery({
    queryKey: ["calendar-subscriptions"],
    queryFn: loadSubscriptions,
  });
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["calendar-subscriptions"] }),
      queryClient.invalidateQueries({ queryKey: listKey(accountId!) }),
      queryClient.invalidateQueries({ queryKey: [accountId, "events"] }),
    ]);
  const fail = (error: Error) => toast.show(m.common_error({ message: error.message }), "error");
  const add = useMutation({
    mutationFn: () => send<ShownSubscription>("", "POST", { url, name }),
    onSuccess: () => {
      setUrl("");
      setName("");
      toast.show(m.calendar_subscribed());
    },
    onError: fail,
    onSettled: refresh,
  });
  const update = useMutation({
    mutationFn: (id: string) => send<ShownSubscription>(`/${id}/refresh`, "POST"),
    onSuccess: (subscription) =>
      subscription.lastError
        ? toast.show(m.common_error({ message: subscription.lastError }), "error")
        : toast.show(m.calendar_subscription_updated()),
    onError: fail,
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => send<void>(`/${id}`, "DELETE"),
    onError: fail,
    onSettled: refresh,
  });
  if (!subscriptions) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (url.trim() && name.trim()) add.mutate();
  };

  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-[12px] font-medium text-muted">{m.calendar_subscriptions()}</h3>
      <p className="m-0 text-[13px] text-muted">{m.calendar_subscriptions_hint()}</p>
      {subscriptions.length ? (
        <ul
          aria-label={m.calendar_subscriptions()}
          className="m-0 flex list-none flex-col gap-1 p-0"
        >
          {subscriptions.map((subscription) => (
            <li key={subscription.id} className="flex min-h-8 items-center gap-2.5">
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate">{subscription.name}</span>
                <span
                  className={`truncate text-[12px] ${subscription.lastError ? "text-danger" : "text-muted"}`}
                  title={subscription.url}
                >
                  {subscription.lastError ??
                    (subscription.lastSyncAt
                      ? m.calendar_subscription_synced({
                          when: synced.format(new Date(subscription.lastSyncAt)),
                        })
                      : subscription.url)}
                </span>
              </span>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={`${m.calendar_subscription_update()}: ${subscription.name}`}
                title={m.calendar_subscription_update()}
                disabled={update.isPending}
                onClick={() => update.mutate(subscription.id)}
              >
                <RefreshCw size={15} />
              </Button>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={`${m.calendar_subscription_remove()}: ${subscription.name}`}
                title={m.calendar_subscription_remove()}
                disabled={remove.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      m.calendar_subscription_remove_confirm({ name: subscription.name }),
                    )
                  )
                    remove.mutate(subscription.id);
                }}
              >
                <Trash2 size={15} />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={submit} className="flex flex-col gap-2 md:flex-row">
        <Input
          aria-label={m.calendar_subscription_url()}
          placeholder={m.calendar_subscription_url_hint()}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          type="url"
          inputMode="url"
          className="md:flex-[2]"
        />
        <Input
          aria-label={m.calendar_subscription_name()}
          placeholder={m.calendar_subscription_name()}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="md:flex-1"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={add.isPending || !url.trim() || !name.trim()}
        >
          {add.isPending ? m.calendar_subscribing() : m.calendar_subscribe()}
        </Button>
      </form>
    </section>
  );
};
