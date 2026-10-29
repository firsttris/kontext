/** Creating a person, and changing one: name, addresses, mailboxes, rights, password, access. */
import { ListFilter } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatSize } from "@/lib/format";
import { m } from "@/paraglide/messages";
import {
  type Company,
  createEmployee,
  type Employee,
  resetPassword,
  resetTwoFactor,
  updateEmployee,
} from "./api";
import {
  AddressInput,
  AliasesField,
  addressFor,
  CheckList,
  ConfirmButton,
  PasswordNotice,
} from "./fields";
import { useCompanyChange } from "./queries";

/** What the person's dialog opens in its place. */
export type EmployeeSubDialog = "vacation" | "rules" | "offboarding";

const mailboxOptions = (company: Company) =>
  company.mailboxes.map((mailbox) => ({
    id: mailbox.id,
    label: mailbox.email,
    detail: mailbox.description,
  }));

const AdminCheckbox = ({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) => (
  <div className="flex flex-col gap-1">
    <label className="flex min-h-9 items-center gap-2.5 text-[14px]">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--accent)]"
      />
      {m.company_admin_label()}
    </label>
    {disabled ? <p className="m-0 text-[12px] text-muted">{m.company_admin_self()}</p> : null}
  </div>
);

const Problem = ({ text }: { text: string | null }) =>
  text ? (
    <p role="alert" className="m-0 text-[13px] text-danger">
      {text}
    </p>
  ) : null;

export const NewEmployeeDialog = ({
  company,
  onClose,
}: {
  company: Company;
  onClose: () => void;
}) => {
  const [fullName, setFullName] = useState("");
  const [local, setLocal] = useState("");
  const [domainId, setDomainId] = useState(company.domains[0]?.id ?? "");
  const [mailboxIds, setMailboxIds] = useState<string[]>([]);
  const [admin, setAdmin] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const create = useCompanyChange(createEmployee);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    try {
      const email = addressFor(local, domainId, company.domains);
      const result = await create.mutateAsync({ email, fullName, admin, mailboxIds });
      setPassword(result.password);
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={m.company_employee_new()}>
      {password ? (
        <>
          <p className="m-0 text-[14px]">{m.company_created({ name: fullName })}</p>
          <PasswordNotice name={fullName} password={password} />
          <Button variant="primary" className="self-end" onClick={onClose}>
            {m.company_done()}
          </Button>
        </>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Label>
            {m.company_name()}
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="off"
            />
          </Label>
          <AddressInput
            local={local}
            domainId={domainId}
            domains={company.domains}
            onChange={(nextLocal, nextDomain) => {
              setLocal(nextLocal);
              setDomainId(nextDomain);
            }}
          />
          <CheckList
            legend={m.company_member_of()}
            options={mailboxOptions(company)}
            selected={mailboxIds}
            onChange={setMailboxIds}
          />
          <AdminCheckbox checked={admin} onChange={setAdmin} />
          <Problem text={problem} />
          <Button type="submit" variant="primary" className="self-end" disabled={create.isPending}>
            {m.company_create()}
          </Button>
        </form>
      )}
    </Dialog>
  );
};

export const EmployeeDialog = ({
  company,
  employee,
  onClose,
  onOpen,
}: {
  company: Company;
  employee: Employee;
  onClose: () => void;
  /** Opens the out-of-office reply, the rules or the leaving instead of this dialog. */
  onOpen: (dialog: EmployeeSubDialog) => void;
}) => {
  const toast = useToast();
  const self = employee.id === company.selfId;
  const [fullName, setFullName] = useState(employee.fullName);
  const [aliases, setAliases] = useState(employee.aliases);
  const [mailboxIds, setMailboxIds] = useState(employee.mailboxIds);
  const [admin, setAdmin] = useState(employee.admin);
  const [problem, setProblem] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const save = useCompanyChange((change: Parameters<typeof updateEmployee>[1]) =>
    updateEmployee(employee.id, change),
  );
  const reset = useCompanyChange(() => resetPassword(employee.id));
  const resetCode = useCompanyChange(() => resetTwoFactor(employee.id));
  const name = employee.fullName;

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setProblem(null);
    try {
      await action();
      if (done) toast.show(done);
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await save.mutateAsync({ fullName, aliases, mailboxIds, admin });
      onClose();
    }, m.company_saved());
  };

  const busy = save.isPending || reset.isPending || resetCode.isPending;
  const domain = company.domains[0]?.name ?? "";

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={m.company_employee_edit()}
      description={employee.email}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Label>
          {m.company_name()}
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Label>
        <AliasesField aliases={aliases} domain={domain} onChange={setAliases} />
        <CheckList
          legend={m.company_member_of()}
          options={mailboxOptions(company)}
          selected={mailboxIds}
          onChange={setMailboxIds}
        />
        <AdminCheckbox checked={admin} onChange={setAdmin} disabled={self} />
        <Problem text={problem} />
        <Button type="submit" variant="primary" className="self-end" disabled={busy}>
          {m.company_save()}
        </Button>
      </form>

      <section className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="m-0 text-[14px] font-semibold">{m.company_access()}</h3>
        <p className="m-0 text-[13px] text-muted">
          {employee.quotaBytes
            ? m.company_storage_of({
                used: formatSize(employee.usedBytes),
                limit: formatSize(employee.quotaBytes),
              })
            : m.company_storage({ used: formatSize(employee.usedBytes) })}
        </p>
        {password ? <PasswordNotice name={name} password={password} /> : null}
        <div className="flex flex-wrap items-start gap-2">
          <Button disabled={busy} onClick={() => onOpen("vacation")}>
            {m.company_vacation()}
          </Button>
          <Button disabled={busy} onClick={() => onOpen("rules")}>
            <ListFilter size={15} /> {m.rules_open()}
          </Button>
          {self ? null : (
            <Button variant="danger" disabled={busy} onClick={() => onOpen("offboarding")}>
              {m.company_offboarding()}
            </Button>
          )}
          <ConfirmButton
            label={m.company_password_reset()}
            question={m.company_password_reset_confirm({ name })}
            disabled={busy}
            onConfirm={() =>
              void run(async () => setPassword((await reset.mutateAsync(undefined)).password))
            }
          />
          {employee.twoFactor ? (
            <ConfirmButton
              label={m.company_code_reset()}
              question={m.company_code_reset_hint({ name })}
              disabled={busy}
              onConfirm={() =>
                void run(() => resetCode.mutateAsync(undefined), m.company_code_reset_done())
              }
            />
          ) : null}
          {self ? null : employee.active ? (
            <ConfirmButton
              danger
              label={m.company_deactivate()}
              question={m.company_deactivate_confirm({ name })}
              disabled={busy}
              onConfirm={() =>
                void run(async () => {
                  await save.mutateAsync({ active: false });
                  onClose();
                }, m.company_deactivated({ name }))
              }
            />
          ) : (
            <Button
              className="self-start"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await save.mutateAsync({ active: true });
                  onClose();
                }, m.company_activated({ name }))
              }
            >
              {m.company_activate()}
            </Button>
          )}
        </div>
      </section>
    </Dialog>
  );
};
