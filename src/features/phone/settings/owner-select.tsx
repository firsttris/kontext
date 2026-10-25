/**
 * A shared mailbox or a person of the company, by account id: where tasks or mails from the
 * telephone go.
 */
import type { ComponentProps } from "react";
import { Select } from "@/components/ui/input";
import { useCompany } from "@/features/company/queries";

export const OwnerSelect = ({
  none,
  ...props
}: { none: string } & Omit<ComponentProps<typeof Select>, "children">) => {
  const { data: company } = useCompany();
  const people = (company?.employees ?? []).filter((employee) => employee.active);
  return (
    <Select {...props}>
      <option value="">{none}</option>
      {(company?.mailboxes ?? []).map((mailbox) => (
        <option key={mailbox.id} value={mailbox.id}>
          {mailbox.email}
        </option>
      ))}
      {people.map((employee) => (
        <option key={employee.id} value={employee.id}>
          {employee.fullName}
        </option>
      ))}
    </Select>
  );
};
