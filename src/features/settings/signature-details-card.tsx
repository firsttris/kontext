/**
 * "Angaben für die Signatur": phone, mobile, position and department for the company signature's
 * [Telefon], [Mobil], [Position] and [Abteilung] (server/company/signature.ts). Saving writes the
 * signature anew into the own sender addresses. Only where the server writes signatures.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import type { SignatureDetails } from "../../../server/company/signature";
import { SettingsCard } from "./settings-page";

const URL = "/api/signature-details";

/** Null where the server has no Stalwart key and so no company signature. */
const loadDetails = async (): Promise<SignatureDetails | null> => {
  const response = await fetch(URL, { credentials: "same-origin" });
  // Without the route, the path falls through to the app's page (or a 404 in development).
  const json = response.headers.get("content-type")?.includes("application/json");
  if (response.status === 404 || (response.ok && !json)) return null;
  if (!response.ok) throw new Error(response.statusText);
  return response.json();
};

const saveDetails = async (details: SignatureDetails): Promise<{ applied: boolean }> => {
  const response = await fetch(URL, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(details),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? response.statusText);
  return body;
};

const FIELDS: [keyof SignatureDetails, () => string, string][] = [
  ["position", m.settings_signature_position, "organization-title"],
  ["department", m.settings_signature_department, "off"],
  ["phone", m.settings_signature_phone, "tel"],
  ["mobile", m.settings_signature_mobile, "tel"],
];

export const SignatureDetailsCard = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["signature-details"], queryFn: loadDetails });
  const [details, setDetails] = useState<SignatureDetails | null>(null);
  useEffect(() => {
    if (data) setDetails(data);
  }, [data]);
  const save = useMutation({
    mutationFn: saveDetails,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["signature-details"] }),
  });
  if (!details) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const { applied } = await save.mutateAsync(details);
      // The sender addresses changed on the server: the composer reads them anew.
      if (applied)
        await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[1] === "identities" });
      toast.show(applied ? m.settings_signature_details_applied() : m.settings_saved());
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <SettingsCard
      title={m.settings_signature_details()}
      description={m.settings_signature_details_hint()}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {FIELDS.map(([key, label, autoComplete]) => (
            <Label key={key}>
              {label()}
              <Input
                value={details[key]}
                maxLength={120}
                autoComplete={autoComplete}
                type={autoComplete === "tel" ? "tel" : "text"}
                onChange={(e) => setDetails({ ...details, [key]: e.target.value })}
              />
            </Label>
          ))}
        </div>
        <Button type="submit" variant="primary" className="self-start" disabled={save.isPending}>
          {m.contacts_save()}
        </Button>
      </form>
    </SettingsCard>
  );
};
