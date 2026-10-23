/** The automatic out-of-office reply (RFC 8621 VacationResponse), optionally limited to dates. */
import { useClient } from "@/auth/auth";
import { useToast } from "@/components/ui/toast";
import { setVacation } from "@/jmap/settings";
import { type VacationForm as Form, toVacation, toVacationForm } from "@/lib/vacation";
import { m } from "@/paraglide/messages";
import { usePersonalAccountId, useSave, useVacation } from "./queries";
import { SettingsCard } from "./settings-page";
import { VacationForm } from "./vacation-form";

export const VacationSection = () => {
  const client = useClient();
  const toast = useToast();
  const accountId = usePersonalAccountId();
  const { data: vacation } = useVacation();
  const save = useSave(
    (value: Form) => setVacation(client, accountId!, toVacation(value)),
    [[accountId, "vacation"]],
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
        />
      ) : null}
    </SettingsCard>
  );
};
