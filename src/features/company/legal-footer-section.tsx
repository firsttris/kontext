/**
 * Pflichtangaben in the Firmenverwaltung: the lines Kontext puts under every mail sent from the
 * company (Handelsregister, Geschäftsführer, Sitz …). Empty: nothing is added.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { LEGAL_FOOTER_MAX, normalFooter } from "@/lib/legal-footer";
import { m } from "@/paraglide/messages";
import { getLegalFooter, LEGAL_FOOTER_KEY, saveLegalFooter } from "./legal-footer";

export const LegalFooterSection = () => {
  const { data } = useQuery({ queryKey: LEGAL_FOOTER_KEY, queryFn: getLegalFooter });
  return data === undefined ? null : <LegalFooterForm saved={data} />;
};

const LegalFooterForm = ({ saved }: { saved: string }) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState(saved);
  const save = useMutation({
    mutationFn: saveLegalFooter,
    onSuccess: (stored) => {
      setText(stored);
      toast.show(m.company_saved());
    },
    onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: LEGAL_FOOTER_KEY }),
  });

  return (
    <div className="flex max-w-[520px] flex-col gap-4">
      <p className="m-0 text-[13px] text-muted">{m.company_legal_hint()}</p>
      <Label>
        {m.company_legal_label()}
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={LEGAL_FOOTER_MAX}
          rows={6}
          placeholder={m.company_legal_placeholder()}
          className="text-[13px]"
        />
      </Label>
      <div>
        <Button
          variant="primary"
          disabled={save.isPending || normalFooter(text) === saved}
          onClick={() => save.mutate(text)}
        >
          {m.company_save()}
        </Button>
      </div>
    </div>
  );
};
