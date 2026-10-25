/**
 * One's own phone status on the Telefon page: reachable, Bitte nicht stören (nothing rings, the
 * desk phone stays quiet) or away until a time. Colleagues see it, and the others ring instead.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import { setPhoneStatus, usePhone } from "./queries";

/** "2026-10-25T17:00" in local time for the input, from an instant. */
const localInput = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export const PhoneStatus = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { status } = usePhone();
  const [until, setUntil] = useState(localInput(status.until));
  const change = (mode: typeof status.mode, untilLocal: string) =>
    void setPhoneStatus(queryClient, {
      mode,
      until: mode === "away" && untilLocal ? new Date(untilLocal).toISOString() : null,
    }).catch((error: Error) => toast.show(m.common_error({ message: error.message }), "error"));
  return (
    <div className="flex flex-wrap items-center gap-2 text-[14px]">
      <Select
        aria-label={m.phone_status()}
        value={status.mode}
        onChange={(event) => change(event.target.value as typeof status.mode, until)}
        className="w-auto"
      >
        <option value="available">{m.phone_status_available()}</option>
        <option value="dnd">{m.phone_status_dnd()}</option>
        <option value="away">{m.phone_status_away()}</option>
      </Select>
      {status.mode === "away" ? (
        <Input
          type="datetime-local"
          aria-label={m.phone_status_until()}
          value={until}
          onChange={(event) => {
            setUntil(event.target.value);
            change("away", event.target.value);
          }}
          className="w-auto"
        />
      ) : null}
    </div>
  );
};
