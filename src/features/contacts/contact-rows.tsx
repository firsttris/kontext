/** Several values of one kind in the contact form (mail addresses, numbers): a row each. */
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { type EmailRow, PHONE_KINDS, type PhoneKind, type PhoneRow } from "@/lib/contact-form";
import { m } from "@/paraglide/messages";

/** "Telefon", "Telefon 2", …: each input has a name of its own. */
const rowLabel = (label: string, index: number) => (index ? `${label} ${index + 1}` : label);

type RowsProps<Row> = {
  label: string;
  addLabel: string;
  rows: Row[];
  blank: Row;
  onChange: (rows: Row[]) => void;
  renderRow: (row: Row, set: (row: Row) => void, index: number) => ReactNode;
};

const Rows = <Row,>({ label, addLabel, rows, blank, onChange, renderRow }: RowsProps<Row>) => (
  <div className="flex flex-col gap-1.5 text-[13px] text-muted sm:col-span-2">
    <span aria-hidden="true">{label}</span>
    {rows.map((row, index) => (
      // Rows have no id until saved; the inputs are controlled, so the index only reuses them.
      // biome-ignore lint/suspicious/noArrayIndexKey: see above
      <div key={index} className="flex gap-2">
        {renderRow(row, (next) => onChange(rows.map((r, i) => (i === index ? next : r))), index)}
        {rows.length > 1 ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.contacts_remove_row({ field: rowLabel(label, index) })}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <X size={15} />
          </Button>
        ) : null}
      </div>
    ))}
    <Button
      variant="ghost"
      size="sm"
      className="self-start"
      onClick={() => onChange([...rows, blank])}
    >
      {addLabel}
    </Button>
  </div>
);

const phoneKindLabel: Record<PhoneKind, () => string> = {
  mobile: m.contacts_phone_mobile,
  work: m.contacts_phone_work,
  home: m.contacts_phone_home,
  fax: m.contacts_phone_fax,
};

export const phoneKindText = (kind: PhoneKind) => phoneKindLabel[kind]();

export const EmailRows = (props: { rows: EmailRow[]; onChange: (rows: EmailRow[]) => void }) => (
  <Rows
    {...props}
    label={m.contacts_email()}
    addLabel={m.contacts_add_email()}
    blank={{ address: "" }}
    renderRow={(row, set, index) => (
      <Input
        type="email"
        aria-label={rowLabel(m.contacts_email(), index)}
        value={row.address}
        onChange={(e) => set({ ...row, address: e.target.value })}
        autoComplete="off"
      />
    )}
  />
);

export const PhoneRows = (props: { rows: PhoneRow[]; onChange: (rows: PhoneRow[]) => void }) => (
  <Rows
    {...props}
    label={m.contacts_phone()}
    addLabel={m.contacts_add_phone()}
    blank={{ number: "", kind: "mobile" }}
    renderRow={(row, set, index) => (
      <>
        <Select
          aria-label={rowLabel(m.contacts_phone_kind(), index)}
          value={row.kind}
          onChange={(e) => set({ ...row, kind: e.target.value as PhoneKind })}
          className="w-28 shrink-0"
        >
          {PHONE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {phoneKindText(kind)}
            </option>
          ))}
        </Select>
        <Input
          type="tel"
          aria-label={rowLabel(m.contacts_phone(), index)}
          value={row.number}
          onChange={(e) => set({ ...row, number: e.target.value })}
          autoComplete="off"
        />
      </>
    )}
  />
);
