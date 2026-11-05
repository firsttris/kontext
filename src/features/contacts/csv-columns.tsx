/**
 * The columns of a CSV file and the contact field each goes to, with the values of the first rows
 * as a preview. The fields are guessed from the headers (`guessField`); the person corrects them.
 */
import { Select } from "@/components/ui/input";
import { CSV_FIELDS, type CsvField } from "@/lib/csv-contacts";
import { m } from "@/paraglide/messages";

const phone = (kind: () => string) => `${m.contacts_phone()} (${kind()})`;

const label: Record<CsvField, () => string> = {
  given: m.contacts_given,
  surname: m.contacts_surname,
  company: m.contacts_company,
  department: m.contacts_department,
  jobTitle: m.contacts_job_title,
  email: m.contacts_email,
  "phone:mobile": () => phone(m.contacts_phone_mobile),
  "phone:fax": () => phone(m.contacts_phone_fax),
  "phone:home": () => phone(m.contacts_phone_home),
  "phone:work": () => phone(m.contacts_phone_work),
  street: m.contacts_street,
  postcode: m.contacts_postcode,
  city: m.contacts_city,
  country: m.contacts_country,
  website: m.contacts_website,
  birthday: m.contacts_birthday,
  note: m.contacts_note,
  skip: m.contacts_import_skip,
};

type Props = {
  header: string[];
  rows: string[][];
  mapping: CsvField[];
  onChange: (mapping: CsvField[]) => void;
};

export const CsvColumns = ({ header, rows, mapping, onChange }: Props) => (
  <ul aria-label={m.contacts_import_columns()} className="m-0 flex list-none flex-col p-0">
    {header.map((name, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: the columns of one file keep their order
      <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-[13px]">
        <span className="flex min-w-0 flex-1 basis-40 flex-col">
          <span className="truncate font-medium">{name}</span>
          <span className="truncate text-[12px] text-muted">
            {rows
              .slice(0, 3)
              .map((row) => row[i]?.trim())
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <Select
          aria-label={name}
          value={mapping[i]}
          onChange={(e) =>
            onChange(mapping.map((field, j) => (j === i ? (e.target.value as CsvField) : field)))
          }
          className="basis-40"
        >
          {CSV_FIELDS.map((field) => (
            <option key={field} value={field}>
              {label[field]()}
            </option>
          ))}
        </Select>
      </li>
    ))}
  </ul>
);
