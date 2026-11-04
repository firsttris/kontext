/** The automatic out-of-office reply (RFC 8621 VacationResponse), optionally limited to dates. */
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { useToast } from "@/components/ui/toast";
import { useColleagues } from "@/features/sharing/queries";
import { principalName } from "@/jmap/principals";
import { setFilters } from "@/jmap/rules";
import { type VacationForm as Form, toVacation, toVacationForm } from "@/lib/vacation";
import { m } from "@/paraglide/messages";
import { useAccountSettings, useFilters, usePersonalAccountId, useSave } from "./queries";
import { SettingsCard } from "./settings-page";
import { VacationForm } from "./vacation-form";

export const VacationSection = () => {
  const client = useClient();
  const toast = useToast();
  const accountId = usePersonalAccountId();
  const { data: filters } = useFilters();
  const vacation = filters?.vacation;
  const { data: session } = useSession();
  const { data: settings } = useAccountSettings();
  const { colleagues } = useColleagues();
  const deputies = colleagues.flatMap((p) =>
    p.email ? [{ id: p.id, name: principalName(p), email: p.email }] : [],
  );
  // The rules go along unchanged: with rules, the reply runs inside their script.
  const save = useSave(
    (value: Form) =>
      setFilters(client, accountId!, { rules: filters!.rules, vacation: toVacation(value) }),
    [[accountId, "filters"]],
  );

  const onSave = async (form: Form) => {
    try {
      await save.mutateAsync(form);
      toast.show(form.isEnabled ? m.settings_vacation_on() : m.settings_saved());
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <SettingsCard title={m.settings_vacation()} description={m.settings_vacation_hint()}>
      {vacation ? (
        <VacationForm
          initial={toVacationForm(vacation)}
          onSave={(form) => void onSave(form)}
          saving={save.isPending}
          name={settings?.description || session?.username || ""}
          colleagues={deputies}
        />
      ) : null}
    </SettingsCard>
  );
};
