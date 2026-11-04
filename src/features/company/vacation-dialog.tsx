/** A colleague's out-of-office reply set by the Firmenverwaltung. */
import { useQuery } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { VacationForm } from "@/features/settings/vacation-form";
import { toVacation, toVacationForm } from "@/lib/vacation";
import { m } from "@/paraglide/messages";
import { type Company, type Employee, getEmployeeVacation, setEmployeeVacation } from "./api";
import { useCompanyChange } from "./queries";

export const VacationDialog = ({
  company,
  employee,
  onClose,
}: {
  company: Company;
  employee: Employee;
  onClose: () => void;
}) => {
  const toast = useToast();
  const { data: vacation } = useQuery({
    queryKey: ["company", "vacation", employee.id],
    queryFn: () => getEmployeeVacation(employee.id),
  });
  const save = useCompanyChange((value: Parameters<typeof toVacation>[0]) =>
    setEmployeeVacation(employee.id, toVacation(value)),
  );
  const colleagues = company.employees
    .filter((e) => e.active && e.id !== employee.id)
    .map((e) => ({ id: e.id, name: e.fullName, email: e.email }));

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={m.company_vacation_title({ name: employee.fullName })}
      description={m.company_vacation_hint({ name: employee.fullName.split(" ")[0] ?? "" })}
    >
      {vacation?.departed ? (
        <p className="m-0 rounded-lg bg-subtle px-3 py-2.5 text-[13px]">
          {m.company_vacation_departed({ name: employee.fullName.split(" ")[0] ?? "" })}
        </p>
      ) : vacation ? (
        <VacationForm
          initial={toVacationForm(vacation)}
          saving={save.isPending}
          name={employee.fullName}
          colleagues={colleagues}
          onSave={(form) =>
            void save.mutateAsync(form).then(
              () => {
                toast.show(m.company_vacation_saved());
                onClose();
              },
              (error: Error) => toast.show(m.common_error({ message: error.message }), "error"),
            )
          }
        />
      ) : (
        <p className="m-0 text-[14px] text-muted">{m.common_loading()}</p>
      )}
    </Dialog>
  );
};
