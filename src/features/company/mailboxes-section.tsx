/** Shared mailboxes (Stalwart groups): creating them, their addresses and who belongs to them. */
import { Inbox, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import { type Company, createMailbox, type SharedMailbox, updateMailbox } from "./api";
import { AccessList, AddressInput, AliasesField, addressFor } from "./fields";
import { CompanyGate } from "./gate";
import { useCompanyChange } from "./queries";

export const MailboxesSection = () => (
  <CompanyGate>{(company) => <Mailboxes company={company} />}</CompanyGate>
);

const firstNames = (company: Company, ids: string[]): string =>
  company.employees
    .filter((e) => ids.includes(e.id))
    .map((e) => e.fullName.split(" ")[0])
    .join(", ");

const memberNames = (company: Company, mailbox: SharedMailbox): string => {
  const members = firstNames(company, mailbox.memberIds) || m.company_no_members();
  const readers = firstNames(company, mailbox.readerIds);
  return readers ? `${members} · ${m.company_readers({ names: readers })}` : members;
};

const Mailboxes = ({ company }: { company: Company }) => {
  const [open, setOpen] = useState<string | "new" | null>(null);
  const mailbox = company.mailboxes.find((mb) => mb.id === open);

  return (
    <>
      <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
        <p className="m-0 flex-1 text-[13px] text-muted">{m.company_mailboxes_hint()}</p>
        <Button variant="primary" onClick={() => setOpen("new")}>
          <Plus size={15} /> {m.company_mailbox_new()}
        </Button>
      </div>
      {company.mailboxes.length ? (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-xl border border-border p-0">
          {company.mailboxes.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setOpen(item.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-hover md:px-4"
              >
                <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full border border-border bg-subtle text-muted">
                  <Inbox size={16} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[14px] font-medium">
                    {item.email}
                    {item.description ? (
                      <span className="font-normal text-muted"> · {item.description}</span>
                    ) : null}
                  </span>
                  <span className="truncate text-[13px] text-muted">
                    {memberNames(company, item)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[14px] text-muted">{m.company_no_mailboxes()}</p>
      )}
      {open === "new" ? (
        <MailboxDialog company={company} onClose={() => setOpen(null)} />
      ) : mailbox ? (
        <MailboxDialog
          key={mailbox.id}
          company={company}
          mailbox={mailbox}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
};

/** New with `mailbox` left out; otherwise its description, addresses and members. */
const MailboxDialog = ({
  company,
  mailbox,
  onClose,
}: {
  company: Company;
  mailbox?: SharedMailbox;
  onClose: () => void;
}) => {
  const toast = useToast();
  const [local, setLocal] = useState("");
  const [domainId, setDomainId] = useState(company.domains[0]?.id ?? "");
  const [description, setDescription] = useState(mailbox?.description ?? "");
  const [aliases, setAliases] = useState(mailbox?.aliases ?? []);
  const [memberIds, setMemberIds] = useState(mailbox?.memberIds ?? []);
  const [readerIds, setReaderIds] = useState(mailbox?.readerIds ?? []);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useCompanyChange(async () =>
    mailbox
      ? updateMailbox(mailbox.id, { description, aliases, memberIds, readerIds })
      : createMailbox({
          email: addressFor(local, domainId, company.domains),
          description,
          memberIds,
          readerIds,
        }),
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    try {
      await save.mutateAsync(undefined);
      toast.show(m.company_saved());
      onClose();
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={mailbox ? m.company_mailbox_edit() : m.company_mailbox_new()}
      description={mailbox?.email}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {mailbox ? null : (
          <AddressInput
            local={local}
            domainId={domainId}
            domains={company.domains}
            onChange={(nextLocal, nextDomain) => {
              setLocal(nextLocal);
              setDomainId(nextDomain);
            }}
          />
        )}
        <Label>
          {m.company_mailbox_description()}
          <Input
            value={description}
            placeholder={m.company_mailbox_description_placeholder()}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Label>
        {mailbox ? (
          <AliasesField
            aliases={aliases}
            domain={company.domains[0]?.name ?? ""}
            onChange={setAliases}
          />
        ) : null}
        <AccessList
          people={company.employees.filter(
            (e) => e.active || memberIds.includes(e.id) || readerIds.includes(e.id),
          )}
          memberIds={memberIds}
          readerIds={readerIds}
          onChange={(members, readers) => {
            setMemberIds(members);
            setReaderIds(readers);
          }}
        />
        {problem ? (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {problem}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="self-end" disabled={save.isPending}>
          {mailbox ? m.company_save() : m.company_create()}
        </Button>
      </form>
    </Dialog>
  );
};
