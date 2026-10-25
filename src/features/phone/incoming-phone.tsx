/**
 * A phone call coming in through the telephone box: who it is (from the address books), the
 * latest mail and the next appointment with them, and "Annehmen" to take it in Kontext. The desk
 * phones ring at the same time; whoever takes it first has it.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Phone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useCallStore } from "@/features/calls/call-store";
import { startRinging } from "@/features/calls/ringtone";
import { useMe } from "@/features/tasks/queries";
import { eventTimes } from "@/lib/jscalendar";
import { type PhoneCall, readableNumber, ringingPhoneCall } from "@/lib/phone";
import { m } from "@/paraglide/messages";
import { dismissPhone, usePhoneStore } from "./phone-store";
import { answerPhone, usePhone } from "./queries";
import { useCallerContext, useCallerName } from "./use-caller";

const whenFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const Ringing = ({ call, canAnswer }: { call: PhoneCall; canAnswer: boolean }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const caller = useCallerName(call.remote);
  const { lastMail, nextEvent } = useCallerContext(caller.contact);
  const [busy, setBusy] = useState(false);
  useEffect(() => startRinging(0.05), []);

  const answer = async () => {
    setBusy(true);
    try {
      await answerPhone(queryClient, call.id);
    } catch (error) {
      toast.show(m.phone_failed({ message: (error as Error).message }), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogPrimitive.Root
      modal={false}
      open
      onOpenChange={(open) => (open ? undefined : dismissPhone(call.id))}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          className="fixed inset-x-3 top-3 z-[70] flex flex-col gap-3 rounded-2xl border border-border bg-bg p-4 shadow-2xl outline-none safe-top md:inset-x-auto md:top-4 md:right-4 md:w-[360px]"
        >
          <div className="flex items-center gap-3">
            <Avatar name={caller.name} size={44} className="animate-pulse" />
            <div className="flex min-w-0 flex-1 flex-col">
              <DialogPrimitive.Title className="m-0 truncate text-[15px] font-semibold">
                {m.phone_incoming({ name: caller.name })}
              </DialogPrimitive.Title>
              <span className="truncate text-[13px] text-muted">
                {[caller.company, caller.contact ? readableNumber(call.remote) : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <DialogPrimitive.Close
              aria-label={m.phone_dismiss()}
              title={m.phone_dismiss()}
              className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-fg"
            >
              <X size={16} />
            </DialogPrimitive.Close>
          </div>
          {lastMail || nextEvent ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-muted">
              {lastMail ? (
                <li className="truncate">
                  {m.phone_last_mail({ subject: lastMail.subject ?? "" })}
                </li>
              ) : null}
              {nextEvent ? (
                <li className="truncate">
                  {m.phone_next_event({
                    title: nextEvent.title ?? "",
                    when: whenFormat.format(eventTimes(nextEvent).start),
                  })}
                </li>
              ) : null}
            </ul>
          ) : null}
          <div className="flex gap-2">
            {caller.contact ? (
              <Button asChild className="flex-1">
                <Link
                  to="/contacts"
                  search={{ id: caller.contact.id, account: caller.contact.accountId }}
                >
                  {m.phone_open_contact()}
                </Link>
              </Button>
            ) : null}
            {canAnswer ? (
              <Button
                className="flex-1 border-ok text-ok"
                disabled={busy}
                onClick={() => void answer()}
              >
                <Phone size={15} />
                {m.phone_answer()}
              </Button>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export const IncomingPhone = () => {
  const me = useMe();
  const { calls, online } = usePhone();
  const { active, dismissed } = usePhoneStore();
  const { active: inChatCall } = useCallStore();
  const call = ringingPhoneCall(calls, me, dismissed);
  if (!call || active) return null;
  // A colleague's call in the chat goes on; the phone still shows who rings, without answering.
  return <Ringing key={call.id} call={call} canAnswer={online && !inChatCall} />;
};
