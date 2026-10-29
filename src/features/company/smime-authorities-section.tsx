/**
 * S/MIME-Stellen in the Firmenverwaltung: authorities the company trusts beyond Mozilla's list,
 * as a root or intermediate certificate (PEM or DER), each with its name, issuer and validity.
 * The server checks the file and keeps it (server/smime/authorities.ts).
 */
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Trash2, Upload } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { LOCALE } from "@/lib/locale";
import { bytesToBase64 } from "@/lib/secure";
import { m } from "@/paraglide/messages";
import {
  addSmimeAuthority,
  getSmimeAuthorities,
  removeSmimeAuthority,
  type SmimeAuthority,
} from "./api";
import { useCompanyChange } from "./queries";

const KEY = ["company", "smime-authorities"];

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" });

/** A PEM file as its text, anything else (DER) as base64. */
export const certificateText = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  return text.includes("-----BEGIN CERTIFICATE-----") ? text : bytesToBase64(bytes);
};

const Row = ({ authority, onRemove }: { authority: SmimeAuthority; onRemove: () => void }) => (
  <li className="flex items-start gap-3 py-3">
    <BadgeCheck size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-[14px] font-medium">
        {authority.subject}
        {authority.selfSigned ? (
          <span className="ml-2 rounded-full bg-subtle px-2 py-0.5 text-[11px] font-normal text-muted">
            {m.company_smime_root()}
          </span>
        ) : null}
      </span>
      {authority.selfSigned ? null : (
        <span className="truncate text-[13px] text-muted">
          {m.company_smime_issued_by({ issuer: authority.issuer })}
        </span>
      )}
      <span className="text-[13px] text-muted">
        {m.company_smime_valid({ from: day(authority.notBefore), to: day(authority.notAfter) })}
      </span>
      <span className="truncate font-mono text-[11px] text-muted" title={authority.fingerprint}>
        SHA-256 {authority.fingerprint}
      </span>
    </div>
    <button
      type="button"
      aria-label={m.company_smime_remove({ name: authority.subject })}
      title={m.company_smime_remove({ name: authority.subject })}
      onClick={onRemove}
      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-danger"
    >
      <Trash2 size={16} />
    </button>
  </li>
);

export const SmimeAuthoritiesSection = () => {
  const toast = useToast();
  const { data } = useQuery({ queryKey: KEY, queryFn: getSmimeAuthorities });
  const add = useCompanyChange(addSmimeAuthority);
  const remove = useCompanyChange(removeSmimeAuthority);
  const authorities = data?.authorities ?? [];
  const fail = (error: Error) => toast.show(m.common_error({ message: error.message }), "error");

  const bring = async (file: File) => {
    try {
      await add.mutateAsync(await certificateText(file));
      toast.show(m.company_smime_added());
    } catch (error) {
      fail(error as Error);
    }
  };
  const drop = async (authority: SmimeAuthority) => {
    if (!window.confirm(m.company_smime_remove_confirm({ name: authority.subject }))) return;
    try {
      await remove.mutateAsync(authority.fingerprint);
      toast.show(m.company_smime_removed());
    } catch (error) {
      fail(error as Error);
    }
  };

  return (
    <div className="flex max-w-[620px] flex-col gap-4">
      <p className="m-0 text-[13px] text-muted">{m.company_smime_hint()}</p>
      {authorities.length ? (
        <ul
          aria-label={m.company_smime_list()}
          className="m-0 flex list-none flex-col divide-y divide-border rounded-xl border border-border px-4 py-0"
        >
          {authorities.map((authority) => (
            <Row
              key={authority.fingerprint}
              authority={authority}
              onRemove={() => void drop(authority)}
            />
          ))}
        </ul>
      ) : data ? (
        <p className="m-0 text-[14px] text-muted">{m.company_smime_empty()}</p>
      ) : null}
      <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 self-start rounded-lg border border-border px-3 text-[14px] hover:bg-hover">
        <Upload size={15} /> {m.company_smime_add()}
        <input
          type="file"
          accept=".cer,.crt,.pem,.der,application/pkix-cert,application/x-x509-ca-cert"
          hidden
          disabled={add.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void bring(file);
            event.target.value = "";
          }}
        />
      </label>
    </div>
  );
};
