/**
 * Pictures from the internet by sender: the list kept on Kontext's server (/api/image-senders),
 * and the line above a mail that loads them once or always (the settings: image-senders-card.tsx).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageOff, Images } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";

const KEY = ["image-senders"];

const send = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(`/api/image-senders${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as {
    senders?: string[];
    error?: string;
  };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result.senders ?? [];
};

export const useImageSenders = () => {
  const queryClient = useQueryClient();
  const { data = [] } = useQuery({ queryKey: KEY, queryFn: () => send("GET", "") });
  const change = useMutation({
    mutationFn: ({ address, on }: { address: string; on: boolean }) =>
      on ? send("PUT", "", { address }) : send("POST", "/remove", { address }),
    onSuccess: (senders) => queryClient.setQueryData(KEY, senders),
  });
  return {
    senders: data,
    trust: (address: string, on = true) => change.mutateAsync({ address, on }),
  };
};

/**
 * Above a mail with pictures: blocked ("Laden", "Immer von …"), loaded for a trusted sender
 * ("Nicht mehr"), or kept out because the sender is not confirmed.
 */
export const ImagesLine = ({
  state,
  sender,
  onLoad,
}: {
  state: "blocked" | "trusted" | "unconfirmed";
  sender: string;
  onLoad: () => void;
}) => {
  const { trust } = useImageSenders();
  const toast = useToast();
  const set = (on: boolean) =>
    void trust(sender.toLowerCase(), on).catch((error: Error) =>
      toast.show(m.common_error({ message: error.message }), "error"),
    );
  const link = "text-[12px] font-medium text-fg underline-offset-2 hover:underline";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 self-start rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted">
      {state === "trusted" ? <Images size={14} /> : <ImageOff size={14} />}
      <span>
        {state === "trusted"
          ? m.mail_images_trusted({ sender })
          : state === "unconfirmed"
            ? m.mail_images_unconfirmed()
            : m.mail_images_blocked()}
      </span>
      {state === "trusted" ? (
        <button type="button" className={link} onClick={() => set(false)}>
          {m.mail_images_stop()}
        </button>
      ) : (
        <>
          <button type="button" className={link} onClick={onLoad}>
            {m.mail_images_load()}
          </button>
          {state === "blocked" && sender ? (
            <button
              type="button"
              className={link}
              onClick={() => {
                set(true);
                onLoad();
              }}
            >
              {m.mail_images_always({ sender })}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
};
