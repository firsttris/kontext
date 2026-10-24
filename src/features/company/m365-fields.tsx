/**
 * The Microsoft 365 part of "Postfach verbinden": once per company the app's credentials, then
 * per person which Microsoft 365 mailbox moves into their account.
 */
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { m } from "@/paraglide/messages";
import { type Company, connectM365, createSync, getM365 } from "./api";
import { useCompanyChange } from "./queries";

const Problem = ({ text }: { text: string | null }) =>
  text ? (
    <p role="alert" className="m-0 text-[13px] text-danger">
      {text}
    </p>
  ) : null;

const SetupForm = ({ onDone }: { onDone: () => void }) => {
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const save = useCompanyChange(connectM365);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    try {
      await save.mutateAsync({ tenantId, clientId, clientSecret });
      onDone();
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-[14px] font-semibold">{m.company_m365_setup()}</h3>
        <p className="m-0 text-[13px] text-muted">{m.company_m365_setup_hint()}</p>
      </div>
      <Label>
        {m.company_m365_tenant()}
        <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} required />
      </Label>
      <Label>
        {m.company_m365_client()}
        <Input value={clientId} onChange={(e) => setClientId(e.target.value)} required />
      </Label>
      <Label>
        {m.company_m365_secret()}
        <Input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          autoComplete="off"
          required
        />
      </Label>
      <Problem text={problem} />
      <Button type="submit" variant="primary" className="self-end" disabled={save.isPending}>
        {m.company_m365_connect()}
      </Button>
    </form>
  );
};

/** Proposes the Microsoft 365 mailbox with the same name before the @. */
const guess = (users: { login: string; address: string }[], email: string) => {
  const local = email.split("@")[0]?.toLowerCase();
  return (
    users.find((u) => u.address.split("@")[0]?.toLowerCase() === local)?.login ??
    users[0]?.login ??
    ""
  );
};

export const M365Fields = ({
  company,
  accountId,
  onClose,
}: {
  company: Company;
  accountId: string;
  onClose: () => void;
}) => {
  const { data: state, refetch } = useQuery({
    queryKey: ["company", "m365"],
    queryFn: getM365,
  });
  const [setup, setSetup] = useState(false);
  const email = company.employees.find((e) => e.id === accountId)?.email ?? "";
  const [chosen, setChosen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const connect = useCompanyChange(createSync);
  if (!state) return <p className="m-0 text-[13px] text-muted">{m.common_loading()}</p>;
  if (!state.connected || setup) {
    return (
      <SetupForm
        onDone={() => {
          setSetup(false);
          void refetch();
        }}
      />
    );
  }
  const login = chosen ?? guess(state.users, email);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    try {
      await connect.mutateAsync({ accountId, provider: "m365", login, password: "" });
      onClose();
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="m-0 text-[13px] text-muted">
        {m.company_m365_connected({ tenant: state.tenantId ?? "" })}{" "}
        <button
          type="button"
          onClick={() => setSetup(true)}
          className="border-0 bg-transparent p-0 text-[13px] text-fg underline"
        >
          {m.company_m365_change()}
        </button>
      </p>
      <p className="m-0 text-[13px] text-muted">{m.company_m365_hint()}</p>
      <Label>
        {m.company_m365_mailbox()}
        <Select value={login} onChange={(e) => setChosen(e.target.value)} required>
          {state.users.map((user) => (
            <option key={user.login} value={user.login}>
              {user.name} ({user.address})
            </option>
          ))}
        </Select>
      </Label>
      <Problem text={problem ?? state.error ?? null} />
      <Button
        type="submit"
        variant="primary"
        className="self-end"
        disabled={connect.isPending || !login}
      >
        {m.company_sync_connect()}
      </Button>
    </form>
  );
};
