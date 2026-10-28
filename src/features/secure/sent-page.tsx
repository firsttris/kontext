/**
 * "Vertraulich gesendet": the confidential messages one sent by link – to whom, whether opened,
 * answers –, read again with one's own key (it holds each message's key), a new code for a
 * recipient, or taking one back.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, KeyRound, Trash2 } from "lucide-react";
import { TabBar } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { LOCALE } from "@/lib/locale";
import {
  type SecureContent,
  type SecureReply,
  secureCode,
  unseal,
  unwrapForSender,
} from "@/lib/secure";
import { m } from "@/paraglide/messages";
import { Unlock } from "../pgp/pgp-mail";
import { useUnlockedKey } from "../pgp/queries";
import {
  type SecureSummary,
  send,
  showCodes,
  useSecureActions,
  useSecureMessages,
} from "./queries";
import { SecureContentView } from "./secure-view";

const date = (iso: string) =>
  new Date(iso).toLocaleString(LOCALE, {
    timeZone: "Europe/Berlin",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const status = (message: SecureSummary) =>
  message.state === "expired"
    ? m.secure_state_expired()
    : message.state === "locked"
      ? m.secure_state_locked()
      : message.openedAt
        ? m.secure_state_opened({ when: date(message.openedAt) })
        : m.secure_state_waiting();

const Opened = ({ message }: { message: SecureSummary }) => {
  const key = useUnlockedKey();
  const actions = useSecureActions();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, error } = useQuery({
    queryKey: ["secure", message.id, "content", key?.getFingerprint(), message.replies],
    queryFn: async () => {
      const result = await send<{
        senderKey: string;
        ciphertext: string;
        replies: { ciphertext: string }[];
      }>("GET", `secure/${encodeURIComponent(message.id)}`);
      const secret = await unwrapForSender(result.senderKey, key!);
      void actions.settle();
      return {
        content: await unseal<SecureContent>(secret, result.ciphertext),
        replies: await Promise.all(
          result.replies.map((reply) => unseal<SecureReply>(secret, reply.ciphertext)),
        ),
      };
    },
    enabled: Boolean(key),
    retry: false,
  });

  const newCode = async () => {
    const code = secureCode();
    try {
      await actions.newCode({ id: message.id, code });
      showCodes([{ to: message.to, code }]);
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };
  const remove = async () => {
    if (!window.confirm(m.secure_remove_confirm({ to: message.to }))) return;
    await actions.remove(message.id);
    toast.show(m.secure_removed());
    void navigate({ to: "/secure", search: {} });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-[14px] text-muted">
          {m.secure_to({ to: message.to })} · {status(message)}
        </span>
        <Button variant="outline" size="sm" onClick={() => void newCode()}>
          <KeyRound size={14} /> {m.secure_new_code()}
        </Button>
        <Button variant="ghost" size="sm" className="text-danger" onClick={() => void remove()}>
          <Trash2 size={14} /> {m.secure_remove()}
        </Button>
      </div>
      {!key ? <Unlock /> : null}
      {error ? (
        <p role="alert" className="m-0 text-[14px] text-danger">
          {m.secure_cannot_read()}
        </p>
      ) : null}
      {data ? (
        <SecureContentView content={data.content} replies={data.replies} sender={m.secure_you()} />
      ) : null}
    </div>
  );
};

export const SecureSentPage = ({ messageId }: { messageId?: string }) => {
  const messages = useSecureMessages();
  const open = messages.find((message) => message.id === messageId);
  return (
    <>
      <section
        aria-label={m.secure_list_link()}
        className={cn(
          "h-full w-full shrink-0 flex-col border-border md:w-[380px] md:border-r",
          open ? "hidden md:flex" : "flex",
        )}
      >
        <header className="border-b border-border px-4 py-3 md:px-5">
          <h1 className="m-0 text-[22px] font-semibold tracking-tight md:text-[18px]">
            {m.secure_list_link()}
          </h1>
          <p className="m-0 mt-1 text-[13px] text-muted">{m.secure_list_hint()}</p>
        </header>
        <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-2">
          {messages.length === 0 ? (
            <li className="px-3 py-6 text-center text-[14px] text-muted">
              {m.secure_list_empty()}
            </li>
          ) : null}
          {messages.map((message) => (
            <li key={message.id}>
              <Link
                to="/secure"
                search={{ message: message.id }}
                className={cn(
                  "flex flex-col gap-0.5 rounded-lg px-3 py-2.5 text-fg no-underline hover:bg-hover",
                  message.id === open?.id && "bg-subtle",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{message.to}</span>
                  {message.unreadReplies ? (
                    <span className="rounded-full bg-accent-fill px-1.5 text-[11px] font-medium text-white">
                      {m.secure_new_replies({ count: message.unreadReplies })}
                    </span>
                  ) : null}
                </span>
                <span className="truncate text-[12px] text-muted">
                  {date(message.createdAt)} · {status(message)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <TabBar />
      </section>
      <main
        className={cn(
          "h-full min-w-0 flex-1 flex-col overflow-y-auto",
          open ? "flex" : "hidden md:flex",
        )}
      >
        {open ? (
          <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-4 py-4 md:px-8 md:py-6">
            <Link
              to="/secure"
              search={{}}
              className="flex items-center gap-1 text-[14px] text-muted no-underline md:hidden"
            >
              <ChevronLeft size={18} /> {m.secure_list_link()}
            </Link>
            <Opened key={open.id} message={open} />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[14px] text-muted">
            {m.secure_pick()}
          </div>
        )}
      </main>
    </>
  );
};
