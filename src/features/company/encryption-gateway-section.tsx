/**
 * Mails beim Versand verschlüsseln, in the Firmenverwaltung under „Sicherheit der Mails“: the
 * switch for Stalwart's encryption gateway and the keys of recipients outside the company, pasted
 * or looked up by Stalwart (server/company/encryption-gateway.ts).
 */
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import type { KeyOrigin, RecipientKey } from "../../../server/company/encryption-gateway";
import { SettingsCard } from "../settings/settings-page";
import {
  addRecipientKey,
  getEncryptionGateway,
  removeRecipientKey,
  setEncryptionGateway,
} from "./api";
import { useCompanyChange } from "./queries";

const ORIGIN: Record<KeyOrigin, () => string> = {
  manual: m.company_gateway_manual,
  wkd: m.company_gateway_wkd,
  vks: m.company_gateway_vks,
  harvested: m.company_gateway_harvested,
};

const stateOf = (key: RecipientKey) =>
  key.fingerprint ?? (key.checked ? m.company_gateway_not_found() : m.company_gateway_looking());

const Row = ({ item, onRemove }: { item: RecipientKey; onRemove: () => void }) => (
  <li className="flex items-start gap-3 py-3">
    <KeyRound size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-[14px] font-medium">{item.email}</span>
      <span className="text-[13px] text-muted">{ORIGIN[item.origin]()}</span>
      <span className="truncate font-mono text-[11px] text-muted">{stateOf(item)}</span>
    </div>
    <button
      type="button"
      aria-label={m.company_gateway_remove({ email: item.email })}
      title={m.company_gateway_remove({ email: item.email })}
      onClick={onRemove}
      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-danger"
    >
      <Trash2 size={16} />
    </button>
  </li>
);

export const EncryptionGatewaySection = () => {
  const toast = useToast();
  const { data } = useQuery({
    queryKey: ["company", "encryption-gateway"],
    queryFn: getEncryptionGateway,
  });
  const toggle = useCompanyChange(setEncryptionGateway);
  const add = useCompanyChange(addRecipientKey);
  const remove = useCompanyChange(removeRecipientKey);
  const [email, setEmail] = useState("");
  const [key, setKey] = useState("");
  const [lookup, setLookup] = useState<"wkd" | "vks">("wkd");
  const fail = (error: Error) => toast.show(m.common_error({ message: error.message }), "error");
  if (!data) return null;

  const submit = async () => {
    try {
      await add.mutateAsync(key.trim() ? { email, key } : { email, lookup });
      setEmail("");
      setKey("");
      toast.show(m.company_gateway_added());
    } catch (error) {
      fail(error as Error);
    }
  };
  const drop = (item: RecipientKey) => {
    if (window.confirm(m.company_gateway_remove_confirm({ email: item.email })))
      remove.mutate(item.id, { onError: fail });
  };

  return (
    <div className="mt-6 max-w-[640px]">
      <SettingsCard title={m.company_gateway()} description={m.company_gateway_hint()}>
        {data.known ? null : (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {m.company_gateway_unknown()}
          </p>
        )}
        <Switch
          checked={data.enabled}
          disabled={!data.known || toggle.isPending}
          onChange={(enabled) => toggle.mutate(enabled, { onError: fail })}
        >
          <span className="text-[14px]">{m.company_gateway_enabled()}</span>
        </Switch>
        {data.keys.length ? (
          <ul
            aria-label={m.company_gateway_list()}
            className="m-0 flex list-none flex-col divide-y divide-border rounded-xl border border-border px-4 py-0"
          >
            {data.keys.map((item) => (
              <Row key={item.id} item={item} onRemove={() => drop(item)} />
            ))}
          </ul>
        ) : data.known ? (
          <p className="m-0 text-[14px] text-muted">{m.company_gateway_empty()}</p>
        ) : null}
        <Label>
          {m.company_gateway_email()}
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="steuerberater@kanzlei.de"
            spellCheck={false}
          />
        </Label>
        <Label>
          {m.company_gateway_key()}
          <Textarea
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
            spellCheck={false}
            className="font-mono text-[12px]"
          />
        </Label>
        {key.trim() ? null : (
          <Label>
            {m.company_gateway_lookup()}
            <Select
              value={lookup}
              onChange={(event) => setLookup(event.target.value as "wkd" | "vks")}
            >
              <option value="wkd">{m.company_gateway_wkd()}</option>
              <option value="vks">{m.company_gateway_vks()}</option>
            </Select>
          </Label>
        )}
        <div>
          <Button
            variant="primary"
            disabled={!data.known || add.isPending || !email.includes("@")}
            onClick={() => void submit()}
          >
            {key.trim() ? m.company_gateway_add() : m.company_gateway_search()}
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
};
