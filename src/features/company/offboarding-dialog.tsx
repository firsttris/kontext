/** Someone leaves: lock, hand the mailbox over, forward and answer new mail. Nothing is deleted. */
import { type ReactNode, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { withDeputy } from "@/lib/vacation";
import { m } from "@/paraglide/messages";
import { type Company, type Employee, offboard } from "./api";
import { ConfirmButton } from "./fields";
import { useCompanyChange } from "./queries";

const PersonSelect = ({
  label,
  hint,
  people,
  value,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  people: Employee[];
  value: string;
  onChange: (id: string) => void;
}) => (
  <Label>
    {label}
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{m.company_nobody()}</option>
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {person.fullName}
        </option>
      ))}
    </Select>
    {hint ? <span className="text-[12px]">{hint}</span> : null}
  </Label>
);

export const OffboardingDialog = ({
  company,
  employee,
  onClose,
}: {
  company: Company;
  employee: Employee;
  onClose: () => void;
}) => {
  const toast = useToast();
  const name = employee.fullName;
  const colleagues = company.employees.filter((e) => e.active && e.id !== employee.id);
  const [handoverTo, setHandoverTo] = useState("");
  const [forwardTo, setForwardTo] = useState("");
  const [reply, setReply] = useState(true);
  const [subject, setSubject] = useState<string>(m.company_offboarding_subject({ name }));
  const [text, setText] = useState<string>(m.company_offboarding_text({ name }));
  const [problem, setProblem] = useState<string | null>(null);
  const run = useCompanyChange(() =>
    offboard(employee.id, {
      handoverTo: handoverTo || null,
      forwardTo: forwardTo || null,
      reply: reply ? { subject: subject.trim(), text: text.trim() } : null,
    }),
  );

  const chooseForward = (id: string) => {
    setForwardTo(id);
    const person = colleagues.find((c) => c.id === id);
    setText((current) =>
      withDeputy(current, person ? { name: person.fullName, email: person.email } : null),
    );
  };

  const submit = async () => {
    setProblem(null);
    try {
      await run.mutateAsync(undefined);
      toast.show(m.company_offboarding_done({ name }));
      onClose();
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={m.company_offboarding_title({ name })}
      description={m.company_offboarding_hint()}
    >
      <div className="flex flex-col gap-4">
        <PersonSelect
          label={m.company_handover()}
          hint={m.company_handover_hint()}
          people={colleagues}
          value={handoverTo}
          onChange={setHandoverTo}
        />
        <PersonSelect
          label={m.company_forward()}
          people={colleagues}
          value={forwardTo}
          onChange={chooseForward}
        />
        <label className="flex items-center gap-2.5 text-[14px]">
          <input
            type="checkbox"
            checked={reply}
            onChange={(e) => setReply(e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          {m.company_reply_enable()}
        </label>
        {reply ? (
          <>
            <Label>
              {m.mail_subject()}
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
            </Label>
            <Label>
              {m.settings_vacation_message()}
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} />
            </Label>
          </>
        ) : null}
        {problem ? (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {problem}
          </p>
        ) : null}
        <ConfirmButton
          danger
          label={m.company_offboarding_run()}
          question={m.company_offboarding_confirm({ name })}
          disabled={run.isPending}
          onConfirm={() => void submit()}
        />
      </div>
    </Dialog>
  );
};
