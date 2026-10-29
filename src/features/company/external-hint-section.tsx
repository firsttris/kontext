/**
 * Hinweis „Extern“ in the Firmenverwaltung: switched on for the whole company, with the partner
 * domains whose addresses count as inside like the company's own.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { parseDomains } from "@/lib/external-hint";
import { m } from "@/paraglide/messages";
import {
  EXTERNAL_HINT_KEY,
  type ExternalHint,
  saveExternalHint,
  useExternalHint,
} from "./external-hint";

export const ExternalHintSection = () => {
  const { data } = useExternalHint();
  return data ? <ExternalHintForm hint={data} /> : null;
};

const ExternalHintForm = ({ hint }: { hint: ExternalHint }) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(hint.enabled);
  const [partners, setPartners] = useState(hint.partners.join("\n"));
  const parsed = parseDomains(partners);
  const save = useMutation({
    mutationFn: saveExternalHint,
    onSuccess: () => toast.show(m.company_saved()),
    onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: EXTERNAL_HINT_KEY }),
  });
  const changed =
    enabled !== hint.enabled || parsed.domains.join("\n") !== hint.partners.join("\n");

  return (
    <div className="flex max-w-[520px] flex-col gap-4">
      <p className="m-0 text-[13px] text-muted">{m.company_external_intro()}</p>
      <Switch checked={enabled} onChange={setEnabled}>
        <span className="text-[14px]">{m.company_external_enabled()}</span>
      </Switch>
      {hint.domains.length ? (
        <p className="m-0 text-[13px] text-muted">
          {m.company_external_own({ domains: hint.domains.join(", ") })}
        </p>
      ) : null}
      <Label>
        {m.company_external_partners()}
        <Textarea
          value={partners}
          onChange={(event) => setPartners(event.target.value)}
          placeholder="steuerbuero-schmidt.de"
          spellCheck={false}
          className="font-mono text-[13px]"
        />
      </Label>
      <p className="-mt-2 mb-0 text-[13px] text-muted">{m.company_external_partners_hint()}</p>
      {parsed.invalid.length ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {m.company_external_invalid({ domains: parsed.invalid.join(", ") })}
        </p>
      ) : null}
      <div>
        <Button
          variant="primary"
          disabled={save.isPending || !changed || parsed.invalid.length > 0}
          onClick={() => save.mutate({ enabled, partners: parsed.domains })}
        >
          {m.company_save()}
        </Button>
      </div>
    </div>
  );
};
