/** The company's people with their state; a click opens the person. */
import { CalendarClock, UserPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { ColleagueAvatar } from "@/features/photos/colleague-avatar";
import { formatSize } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { useCompanyRules } from "../rules/queries";
import { RulesList } from "../rules/rules-section";
import { type Company, type Employee, showAvailabilityToAll } from "./api";
import { EmployeeDialog, type EmployeeSubDialog, NewEmployeeDialog } from "./employee-dialogs";
import { Badge } from "./fields";
import { CompanyGate } from "./gate";
import { OffboardingDialog } from "./offboarding-dialog";
import { useCompanyChange } from "./queries";
import { SearchIndexNotice } from "./search-index-notice";
import { VacationDialog } from "./vacation-dialog";

export const EmployeesSection = () => (
  <CompanyGate>{(company) => <Employees company={company} />}</CompanyGate>
);

const Employees = ({ company }: { company: Company }) => {
  const [open, setOpen] = useState<string | "new" | null>(null);
  const [next, setNext] = useState<{ id: string; dialog: EmployeeSubDialog } | null>(null);
  const employee = company.employees.find((e) => e.id === open);
  const other = company.employees.find((e) => e.id === next?.id);

  return (
    <>
      <SearchIndexNotice />
      <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
        <p className="m-0 flex-1 text-[13px] text-muted">{m.company_employees_hint()}</p>
        <Button variant="primary" onClick={() => setOpen("new")}>
          <UserPlus size={15} /> {m.company_employee_new()}
        </Button>
      </div>
      <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-xl border border-border p-0">
        {company.employees.map((person) => (
          <li key={person.id}>
            <button
              type="button"
              onClick={() => setOpen(person.id)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-hover md:px-4"
            >
              <ColleagueAvatar email={person.email} name={person.fullName} size={34} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-1.5 text-[14px] font-medium">
                  {person.fullName}
                  {person.id === company.selfId ? <Badge>{m.company_badge_you()}</Badge> : null}
                  {person.admin ? <Badge>{m.company_badge_admin()}</Badge> : null}
                  {person.twoFactor ? <Badge>{m.company_badge_code()}</Badge> : null}
                  {person.active ? null : <Badge tone="danger">{m.company_badge_inactive()}</Badge>}
                </span>
                <span className="truncate text-[13px] text-muted">
                  {[person.email, ...person.aliases].join(", ")}
                </span>
              </span>
              <span className="hidden text-[12px] text-muted tabular-nums md:block">
                {formatSize(person.usedBytes)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <AvailabilityForAll />
      {open === "new" ? (
        <NewEmployeeDialog company={company} onClose={() => setOpen(null)} />
      ) : employee ? (
        <EmployeeDialog
          key={employee.id}
          company={company}
          employee={employee}
          onClose={() => setOpen(null)}
          onOpen={(dialog) => {
            setOpen(null);
            setNext({ id: employee.id, dialog });
          }}
        />
      ) : null}
      {other && next?.dialog === "vacation" ? (
        <VacationDialog company={company} employee={other} onClose={() => setNext(null)} />
      ) : null}
      {other && next?.dialog === "rules" ? (
        <EmployeeRulesDialog employee={other} onClose={() => setNext(null)} />
      ) : null}
      {other && next?.dialog === "offboarding" ? (
        <OffboardingDialog company={company} employee={other} onClose={() => setNext(null)} />
      ) : null}
    </>
  );
};

/**
 * A person's own rules, kept by the admin: the same Sieve script as in their settings, so they
 * see and change these as their own.
 */
const EmployeeRulesDialog = ({
  employee,
  onClose,
}: {
  employee: Employee;
  onClose: () => void;
}) => (
  <Dialog
    open
    onOpenChange={(open) => !open && onClose()}
    title={m.rules_employee_title({ name: employee.fullName })}
    description={m.rules_employee_hint({
      name: employee.email,
      first: employee.fullName.split(" ")[0] ?? "",
    })}
    className="md:w-[min(640px,calc(100vw-32px))]"
  >
    <RulesList store={useCompanyRules({ kind: "employees", id: employee.id })} />
  </Dialog>
);

/**
 * New people see their colleagues' free and busy times on their own (server: calendars.welcome);
 * this turns it on for everyone at once, e.g. after the move to Kontext.
 */
const AvailabilityForAll = () => {
  const toast = useToast();
  const change = useCompanyChange(showAvailabilityToAll);
  const run = async () => {
    try {
      const { calendars } = await change.mutateAsync(undefined);
      toast.show(m.company_availability_done({ count: calendars }));
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };
  return (
    <section
      aria-label={m.company_availability()}
      className="flex flex-col items-start gap-3 rounded-xl border border-border p-4 md:flex-row md:items-center"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[14px] font-medium">{m.company_availability()}</span>
        <span className="text-[13px] text-muted">{m.company_availability_hint()}</span>
      </span>
      <Button disabled={change.isPending} onClick={() => void run()}>
        <CalendarClock size={15} /> {m.company_availability_on()}
      </Button>
    </section>
  );
};
