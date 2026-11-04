/**
 * Als Phishing melden in the Firmenverwaltung: the one address (the IT, the IT provider) a
 * suspicious mail goes to. Without one, nobody is offered the report.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import { SettingsCard } from "../settings/settings-page";
import { getPhishingReport, PHISHING_REPORT_KEY, savePhishingReport } from "./phishing-report";

export const PhishingReportSection = () => {
  const { data } = useQuery({ queryKey: PHISHING_REPORT_KEY, queryFn: getPhishingReport });
  return data === undefined ? null : <PhishingReportForm saved={data} />;
};

const PhishingReportForm = ({ saved }: { saved: string }) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [address, setAddress] = useState(saved);
  const save = useMutation({
    mutationFn: savePhishingReport,
    onSuccess: () => toast.show(m.company_saved()),
    onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: PHISHING_REPORT_KEY }),
  });

  return (
    <div className="mt-6 max-w-[640px]">
      <SettingsCard title={m.company_phishing()} description={m.company_phishing_hint()}>
        <Label>
          {m.company_phishing_address()}
          <Input
            type="email"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="it@firma.de"
            spellCheck={false}
          />
        </Label>
        <div>
          <Button
            variant="primary"
            disabled={save.isPending || address.trim() === saved}
            onClick={() => save.mutate(address.trim())}
          >
            {m.company_save()}
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
};
