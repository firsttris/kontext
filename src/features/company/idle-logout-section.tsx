/**
 * Abmelden nach Inaktivität in the Firmenverwaltung: after how long without input Kontext signs
 * out on every computer of the company (src/lib/idle-logout.ts). Off by default.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { IDLE_MINUTES } from "@/lib/idle-logout";
import { m } from "@/paraglide/messages";
import { getIdleLogout, IDLE_LOGOUT_KEY, idleChoiceText, saveIdleLogout } from "./idle-logout";

export const IdleLogoutSection = () => {
  const { data } = useQuery({ queryKey: IDLE_LOGOUT_KEY, queryFn: getIdleLogout });
  return data === undefined ? null : <IdleLogoutForm saved={data} />;
};

const IdleLogoutForm = ({ saved }: { saved: number }) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [minutes, setMinutes] = useState(saved);
  const save = useMutation({
    mutationFn: saveIdleLogout,
    onSuccess: () => toast.show(m.company_saved()),
    onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: IDLE_LOGOUT_KEY }),
  });

  return (
    <div className="flex max-w-[520px] flex-col gap-4">
      <p className="m-0 text-[13px] text-muted">{m.company_idle_hint()}</p>
      <Label>
        {m.company_idle_label()}
        <Select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
          {IDLE_MINUTES.map((value) => (
            <option key={value} value={value}>
              {idleChoiceText(value)}
            </option>
          ))}
        </Select>
      </Label>
      <div>
        <Button
          variant="primary"
          disabled={save.isPending || minutes === saved}
          onClick={() => save.mutate(minutes)}
        >
          {m.company_save()}
        </Button>
      </div>
    </div>
  );
};
