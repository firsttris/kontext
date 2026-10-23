/** The company's people with their state; a click opens the person. */
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatSize } from "@/lib/format";
import { m } from "@/paraglide/messages";
import type { Company } from "./api";
import { EmployeeDialog, NewEmployeeDialog } from "./employee-dialogs";
import { Badge } from "./fields";
import { CompanyGate } from "./gate";
import { OffboardingDialog } from "./offboarding-dialog";
import { VacationDialog } from "./vacation-dialog";

export const EmployeesSection = () => (
  <CompanyGate>{(company) => <Employees company={company} />}</CompanyGate>
);

const Employees = ({ company }: { company: Company }) => {
  const [open, setOpen] = useState<string | "new" | null>(null);
  const [next, setNext] = useState<{ id: string; dialog: "vacation" | "offboarding" } | null>(null);
  const employee = company.employees.find((e) => e.id === open);
  const other = company.employees.find((e) => e.id === next?.id);

  return (
    <>
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
              <Avatar name={person.fullName} size={34} />
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
      {other && next?.dialog === "offboarding" ? (
        <OffboardingDialog company={company} employee={other} onClose={() => setNext(null)} />
      ) : null}
    </>
  );
};
