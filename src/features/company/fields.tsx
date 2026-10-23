/** Form parts the Firmenverwaltung's dialogs share. */
import { Check, Copy, Plus, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import type { Company } from "./api";

/** "lena" + domain: the new account's address; the domain is a choice only with several. */
export const AddressInput = ({
  local,
  domainId,
  domains,
  onChange,
}: {
  local: string;
  domainId: string;
  domains: Company["domains"];
  onChange: (local: string, domainId: string) => void;
}) => (
  <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
    <legend className="mb-1.5 p-0 text-[13px] text-muted">{m.company_email()}</legend>
    <div className="flex items-center gap-1.5">
      <Input
        aria-label={m.company_email_local()}
        value={local}
        onChange={(e) => onChange(e.target.value.trim().toLowerCase(), domainId)}
        autoComplete="off"
        required
        className="min-w-0 flex-1"
      />
      <span className="text-muted">@</span>
      {domains.length > 1 ? (
        <Select
          aria-label={m.company_domain()}
          value={domainId}
          onChange={(e) => onChange(local, e.target.value)}
          className="w-auto"
        >
          {domains.map((domain) => (
            <option key={domain.id} value={domain.id}>
              {domain.name}
            </option>
          ))}
        </Select>
      ) : (
        <span className="text-[14px]">{domains[0]?.name}</span>
      )}
    </div>
  </fieldset>
);

export const addressFor = (local: string, domainId: string, domains: Company["domains"]) =>
  `${local}@${domains.find((d) => d.id === domainId)?.name ?? ""}`;

/** Choosing several from a list, e.g. the mailboxes of a person or the members of a mailbox. */
export const CheckList = ({
  legend,
  options,
  selected,
  onChange,
  empty,
}: {
  legend: string;
  options: { id: string; label: string; detail?: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  empty?: string;
}) => (
  <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
    <legend className="mb-1.5 p-0 text-[13px] text-muted">{legend}</legend>
    {options.length === 0 && empty ? <p className="m-0 text-[13px] text-muted">{empty}</p> : null}
    {options.map((option) => (
      <label key={option.id} className="flex min-h-9 items-center gap-2.5 text-[14px]">
        <input
          type="checkbox"
          checked={selected.includes(option.id)}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? [...selected, option.id]
                : selected.filter((id) => id !== option.id),
            )
          }
          className="size-4 accent-[var(--accent)]"
        />
        <span className="min-w-0 flex-1 truncate">{option.label}</span>
        {option.detail ? (
          <span className="truncate text-[12px] text-muted">{option.detail}</span>
        ) : null}
      </label>
    ))}
  </fieldset>
);

export type Access = "none" | "read" | "full";

/** Per person who may use a shared mailbox: not at all, read only, or as a member. */
export const AccessList = ({
  people,
  memberIds,
  readerIds,
  onChange,
}: {
  people: { id: string; fullName: string; email: string }[];
  memberIds: string[];
  readerIds: string[];
  onChange: (memberIds: string[], readerIds: string[]) => void;
}) => {
  const accessOf = (id: string): Access =>
    memberIds.includes(id) ? "full" : readerIds.includes(id) ? "read" : "none";
  const choose = (id: string, access: Access) => {
    const without = (list: string[]) => list.filter((other) => other !== id);
    onChange(
      access === "full" ? [...without(memberIds), id] : without(memberIds),
      access === "read" ? [...without(readerIds), id] : without(readerIds),
    );
  };
  return (
    <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
      <legend className="mb-1 p-0 text-[13px] text-muted">{m.company_access_legend()}</legend>
      <p className="m-0 mb-1 text-[12px] text-muted">{m.company_access_hint()}</p>
      {people.map((person) => (
        <div key={person.id} className="flex min-h-10 items-center gap-2.5 text-[14px]">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">{person.fullName}</span>
            <span className="truncate text-[12px] text-muted">{person.email}</span>
          </span>
          <Select
            aria-label={m.company_access_for({ name: person.fullName })}
            value={accessOf(person.id)}
            onChange={(e) => choose(person.id, e.target.value as Access)}
            className="h-9 w-auto"
          >
            <option value="none">{m.company_access_none()}</option>
            <option value="read">{m.company_access_read()}</option>
            <option value="full">{m.company_access_full()}</option>
          </Select>
        </div>
      ))}
    </fieldset>
  );
};

/** Further addresses (aliases) of an account; the server checks the domain. */
export const AliasesField = ({
  aliases,
  domain,
  onChange,
}: {
  aliases: string[];
  domain: string;
  onChange: (aliases: string[]) => void;
}) => {
  const [draft, setDraft] = useState("");
  const add = () => {
    const address = draft.trim().toLowerCase();
    if (!address) return;
    if (!aliases.includes(address)) onChange([...aliases, address]);
    setDraft("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    add();
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-0.5 text-[13px] text-muted">
        {m.company_aliases()}
        <span className="text-[12px]">{m.company_aliases_hint()}</span>
      </div>
      {aliases.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {aliases.map((address) => (
            <li
              key={address}
              className="flex h-7 items-center gap-1 rounded-full border border-border pr-1 pl-3 text-[13px]"
            >
              {address}
              <button
                type="button"
                aria-label={m.company_alias_remove({ address })}
                onClick={() => onChange(aliases.filter((a) => a !== address))}
                className="flex size-5 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          aria-label={m.company_alias_add()}
          type="email"
          value={draft}
          placeholder={m.company_alias_placeholder({ domain })}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1"
        />
        <Button size="icon" onClick={add} aria-label={m.company_alias_add()} className="h-10 w-10">
          <Plus size={16} />
        </Button>
      </div>
    </div>
  );
};

/** The new password, shown once, with a copy button. */
export const PasswordNotice = ({ name, password }: { name: string; password: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(password).catch(() => undefined);
    setCopied(true);
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-subtle p-4">
      <div className="text-[14px] font-medium">{m.company_password_title({ name })}</div>
      <div className="flex items-center gap-2">
        <code
          data-testid="new-password"
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 font-mono text-[15px] tracking-wide select-all"
        >
          {password}
        </code>
        <Button onClick={copy} aria-label={m.company_password_copy()}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? m.company_password_copied() : m.company_password_copy()}
        </Button>
      </div>
      <p className="m-0 text-[13px] text-muted">{m.company_password_hint({ name })}</p>
    </div>
  );
};

/** A small mark next to a name: admin, second factor, locked. */
export const Badge = ({ children, tone }: { children: ReactNode; tone?: "danger" }) => (
  <span
    className={cn(
      "inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium",
      tone === "danger" ? "border-danger text-danger" : "border-border text-muted",
    )}
  >
    {children}
  </span>
);

/** An action that asks once more in place before it runs. */
export const ConfirmButton = ({
  label,
  question,
  onConfirm,
  disabled,
  danger,
}: {
  label: string;
  question: string;
  onConfirm: () => void;
  disabled?: boolean;
  danger?: boolean;
}) => {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button
        variant={danger ? "danger" : "outline"}
        disabled={disabled}
        onClick={() => setAsking(true)}
        className="self-start"
      >
        {label}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <p className="m-0 text-[13px]">{question}</p>
      <div className="flex gap-2">
        <Button
          variant={danger ? "danger" : "primary"}
          disabled={disabled}
          onClick={() => {
            setAsking(false);
            onConfirm();
          }}
        >
          {m.company_confirm()}
        </Button>
        <Button variant="ghost" onClick={() => setAsking(false)}>
          {m.company_cancel()}
        </Button>
      </div>
    </div>
  );
};
