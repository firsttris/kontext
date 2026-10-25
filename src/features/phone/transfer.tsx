/**
 * Weitervermitteln in the phone panel: hand the call to a colleague (it rings for them; I go once
 * they are in) or dial a number or a telephone at the Fritzbox into the call (I go once it is
 * answered, and the two talk on). While it is under way the panel shows how far it got.
 */
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useChatNames } from "@/features/chat/use-chat-names";
import { linesOf, type PhoneCall, readableNumber } from "@/lib/phone";
import { m } from "@/paraglide/messages";
import { leavePhone } from "./phone-store";
import { cancelPhoneTransfer, hangupPhone, transferPhone, usePhone } from "./queries";

export const TransferForm = ({ call, onDone }: { call: PhoneCall; onDone: () => void }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { colleagues } = usePhone();
  const { nameOf } = useChatNames();
  const [number, setNumber] = useState("");
  // Hand over (it is theirs) or ask to join (Rückfrage, three-way: it stays mine).
  const [join, setJoin] = useState(false);
  const hand = async (target: { to: string; join?: boolean } | { number: string }) => {
    try {
      await transferPhone(queryClient, call.id, target);
      onDone();
    } catch (error) {
      toast.show(m.phone_failed({ message: (error as Error).message }), "error");
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (number.trim()) void hand({ number: number.trim() });
  };
  return (
    <section aria-label={m.phone_transfer()} className="flex flex-col gap-2">
      {colleagues.length ? (
        <>
          <fieldset className="m-0 flex gap-1 border-0 p-0">
            <legend className="sr-only">{m.phone_transfer_how()}</legend>
            {[false, true].map((value) => (
              <label
                key={String(value)}
                className={
                  join === value
                    ? "cursor-pointer rounded-md bg-subtle px-2 py-1 text-[12px] font-medium"
                    : "cursor-pointer rounded-md px-2 py-1 text-[12px] text-muted hover:bg-hover"
                }
              >
                <input
                  type="radio"
                  name="transfer-how"
                  checked={join === value}
                  onChange={() => setJoin(value)}
                  className="sr-only"
                />
                {value ? m.phone_transfer_join() : m.phone_transfer_hand()}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-1.5">
            {colleagues.map((id) => (
              <Button key={id} size="sm" onClick={() => void hand({ to: id, join })}>
                {nameOf(id)}
              </Button>
            ))}
          </div>
        </>
      ) : null}
      <form onSubmit={submit} className="flex gap-1.5">
        <Input
          aria-label={m.phone_transfer_number()}
          placeholder={m.phone_transfer_number_hint()}
          value={number}
          onChange={(event) => setNumber(event.target.value)}
          inputMode="tel"
          className="min-w-0 flex-1"
        />
        <Button type="submit" size="sm" disabled={!number.trim()}>
          {m.phone_dial()}
        </Button>
      </form>
    </section>
  );
};

/** How far handing on got: waiting for the colleague, or the lines dialled into the call. */
export const HandoverStatus = ({ call }: { call: PhoneCall }) => {
  const queryClient = useQueryClient();
  const { calls } = usePhone();
  const { nameOf } = useChatNames();
  const lines = linesOf(calls, call);
  if (!call.offeredTo && !lines.length) return null;
  return (
    <ul
      aria-label={m.phone_transfer()}
      className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]"
    >
      {call.offeredTo ? (
        <li className="flex items-center gap-2">
          <span className="flex-1">
            {m.phone_transfer_waiting({ name: nameOf(call.offeredTo) })}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void cancelPhoneTransfer(queryClient, call.id)}
          >
            {m.phone_transfer_cancel()}
          </Button>
        </li>
      ) : null}
      {lines.map((line) => (
        <li key={line.id} className="flex items-center gap-2">
          <span className="flex-1">
            {readableNumber(line.remote)} ·{" "}
            {line.state === "talking" ? m.phone_transfer_connected() : m.phone_dialing()}
          </span>
          {line.state === "talking" ? (
            <Button size="sm" onClick={leavePhone}>
              {m.phone_transfer_leave()}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => void hangupPhone(line.id)}>
            {m.phone_transfer_end()}
          </Button>
        </li>
      ))}
    </ul>
  );
};
