/**
 * Settings → Aufgaben in anderen Apps → App-Passwörter: one password per app for CalDAV, needed
 * with two-step sign-in (Thunderbird and phones ask for no code). Made after the password (and
 * code) once more, shown once, listed with when it was last used, revocable
 * (server/dav/app-passwords.ts).
 */
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { CopyField } from "@/features/agents/agents-section";
import { CredentialFields, type Credentials } from "@/features/agents/credential-fields";
import { ConfirmButton } from "@/features/company/fields";
import { readingDate } from "@/lib/format";
import { m } from "@/paraglide/messages";
import {
  type AppPasswordInfo,
  useAppPasswords,
  useCreateAppPassword,
  useRevokeAppPassword,
} from "./app-passwords-api";
import { useTwoFactor } from "./queries";
import { SettingsCard } from "./settings-page";

export const AppPasswordRow = ({ entry }: { entry: AppPasswordInfo }) => {
  const revoke = useRevokeAppPassword();
  const toast = useToast();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
      <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
        <span className="text-[14px] font-medium">{entry.name}</span>
        <span className="text-[12px] text-muted">
          {m.agents_created({ date: readingDate(entry.createdAt) })} ·{" "}
          {entry.lastUsedAt
            ? m.agents_used({ date: readingDate(entry.lastUsedAt) })
            : m.agents_never_used()}
        </span>
      </div>
      <ConfirmButton
        danger
        label={m.app_passwords_revoke()}
        question={m.app_passwords_revoke_question({ name: entry.name })}
        disabled={revoke.isPending}
        onConfirm={() =>
          revoke.mutate(entry.id, {
            onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
          })
        }
      />
    </li>
  );
};

/** The password just made, shown this once. */
const Created = ({
  name,
  password,
  onDone,
}: {
  name: string;
  password: string;
  onDone: () => void;
}) => (
  <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
    <p role="status" className="m-0 text-[13px] font-medium">
      {m.app_passwords_once()}
    </p>
    <CopyField label={m.app_passwords_password({ name })} value={password} testId="app-password" />
    <Button variant="outline" className="self-start" onClick={onDone}>
      {m.agents_done()}
    </Button>
  </div>
);

const NewAppPasswordForm = ({
  onCreated,
}: {
  onCreated: (name: string, password: string) => void;
}) => {
  const { data: twoFactor } = useTwoFactor();
  const create = useCreateAppPassword();
  const [name, setName] = useState("");
  const [credentials, setCredentials] = useState<Credentials>({ password: "", code: "" });
  const [askCode, setAskCode] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const withCode = Boolean(twoFactor) || askCode;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    try {
      const result = await create.mutateAsync({
        name: name.trim(),
        password: credentials.password,
        code: withCode && credentials.code ? credentials.code : undefined,
      });
      if (result.status === "mfa") {
        setAskCode(true);
        return;
      }
      onCreated(result.info.name, result.password);
      setName("");
      setCredentials({ password: "", code: "" });
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 border-t border-border pt-4">
      <Label>
        {m.app_passwords_name()}
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={m.app_passwords_name_placeholder()}
          maxLength={60}
          required
        />
      </Label>
      <CredentialFields value={credentials} onChange={setCredentials} withCode={withCode} />
      {problem ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {problem}
        </p>
      ) : null}
      <Button type="submit" variant="primary" className="self-start" disabled={create.isPending}>
        {m.app_passwords_create()}
      </Button>
    </form>
  );
};

export const AppPasswordsCard = () => {
  const { data: list = [] } = useAppPasswords();
  const [created, setCreated] = useState<{ name: string; password: string } | null>(null);
  return (
    <SettingsCard title={m.app_passwords_title()} description={m.app_passwords_hint()}>
      {list.length ? (
        <ul aria-label={m.app_passwords_list()} className="m-0 flex list-none flex-col gap-3 p-0">
          {list.map((entry) => (
            <AppPasswordRow key={entry.id} entry={entry} />
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] text-muted">{m.app_passwords_none()}</p>
      )}
      {created ? (
        <Created {...created} onDone={() => setCreated(null)} />
      ) : (
        <NewAppPasswordForm onCreated={(name, password) => setCreated({ name, password })} />
      )}
    </SettingsCard>
  );
};
