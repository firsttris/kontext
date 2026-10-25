/**
 * The team chat in the Firmenverwaltung: how long messages stay, with their photos and files.
 * What is older goes at once when the time is shortened, and every hour after that.
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { RETENTION_DAYS } from "@/lib/chat";
import { retentionText } from "@/lib/chat-threads";
import { m } from "@/paraglide/messages";
import { getChatRetention, saveChatRetention } from "./api";
import { useCompanyChange } from "./queries";

export const ChatSection = () => {
  const { data } = useQuery({ queryKey: ["company", "chat-retention"], queryFn: getChatRetention });
  return data ? <RetentionForm days={data.days} /> : null;
};

const RetentionForm = ({ days }: { days: number }) => {
  const toast = useToast();
  const save = useCompanyChange(saveChatRetention);
  const [chosen, setChosen] = useState(days);
  const shorter = chosen > 0 && (days === 0 || chosen < days);

  const submit = async () => {
    if (shorter && !window.confirm(m.company_chat_confirm({ time: retentionText(chosen) }))) return;
    try {
      const { removed } = await save.mutateAsync(chosen);
      toast.show(removed ? m.company_chat_removed({ count: removed }) : m.company_saved());
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <div className="flex max-w-[520px] flex-col gap-4">
      <p className="m-0 text-[13px] text-muted">{m.company_chat_hint()}</p>
      <Label>
        {m.company_chat_keep()}
        <Select value={chosen} onChange={(event) => setChosen(Number(event.target.value))}>
          {RETENTION_DAYS.map((value) => (
            <option key={value} value={value}>
              {value === 0 ? m.company_chat_forever() : retentionText(value)}
            </option>
          ))}
        </Select>
      </Label>
      {shorter ? (
        <p className="m-0 text-[13px] text-warn">
          {m.company_chat_warning({ time: retentionText(chosen) })}
        </p>
      ) : null}
      <div>
        <Button
          variant="primary"
          disabled={save.isPending || chosen === days}
          onClick={() => void submit()}
        >
          {m.company_save()}
        </Button>
      </div>
    </div>
  );
};
