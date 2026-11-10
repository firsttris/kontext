/**
 * Settings → Passwort und Sicherheit → Passkeys: sign in with the fingerprint, face or the
 * device's PIN instead of the password. Stalwart keeps them (src/jmap/passkeys.ts); a new one
 * needs the password (and code) once more, then the browser makes it for Kontext's address.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useClient } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { CredentialFields, type Credentials } from "@/features/agents/credential-fields";
import { ConfirmButton } from "@/features/company/fields";
import {
  createPasskey,
  deletePasskey,
  listPasskeys,
  type Passkey,
  passkeyOptions,
  renamePasskey,
} from "@/jmap/passkeys";
import { readingDate } from "@/lib/format";
import { creationOptions, isCancelled, passkeysSupported, registrationJson } from "@/lib/webauthn";
import { m } from "@/paraglide/messages";
import { useSave, useTwoFactor } from "./queries";
import { SettingsCard } from "./settings-page";

const KEY = ["settings", "passkeys"];

const usePasskeys = () => {
  const client = useClient();
  return useQuery({ queryKey: KEY, queryFn: () => listPasskeys(client), retry: false });
};

const PasskeyRow = ({ passkey }: { passkey: Passkey }) => {
  const client = useClient();
  const toast = useToast();
  const [name, setName] = useState<string | null>(null);
  const rename = useSave(
    (description: string) => renamePasskey(client, passkey.id, description),
    [KEY],
  );
  const remove = useSave(() => deletePasskey(client, passkey.id), [KEY]);
  const failed = (error: Error) => toast.show(m.common_error({ message: error.message }), "error");

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!name?.trim()) return;
    rename.mutate(name.trim(), { onSuccess: () => setName(null), onError: failed });
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
      <KeyRound size={16} className="shrink-0 text-muted" aria-hidden="true" />
      {name === null ? (
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
          <span className="text-[14px] font-medium">{passkey.description}</span>
          <span className="text-[12px] text-muted">
            {m.agents_created({ date: readingDate(passkey.createdAt) })}
          </span>
        </div>
      ) : (
        <form onSubmit={save} className="flex min-w-0 flex-1 basis-48 gap-2">
          <Input
            aria-label={m.passkeys_name()}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            autoFocus
          />
          <Button type="submit" disabled={rename.isPending}>
            {m.passkeys_save()}
          </Button>
        </form>
      )}
      {name === null ? (
        <Button variant="ghost" onClick={() => setName(passkey.description)}>
          {m.passkeys_rename()}
        </Button>
      ) : (
        <Button variant="ghost" onClick={() => setName(null)}>
          {m.contacts_cancel()}
        </Button>
      )}
      <ConfirmButton
        danger
        label={m.passkeys_delete()}
        question={m.passkeys_delete_question({ name: passkey.description })}
        disabled={remove.isPending}
        onConfirm={() => remove.mutate(undefined, { onError: failed })}
      />
    </li>
  );
};

const NewPasskeyForm = ({ onDone }: { onDone: () => void }) => {
  const client = useClient();
  const toast = useToast();
  const { data: twoFactor } = useTwoFactor();
  const [name, setName] = useState("");
  const [credentials, setCredentials] = useState<Credentials>({ password: "", code: "" });
  const [problem, setProblem] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const create = useMutation({
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
    mutationFn: async () => {
      const options = await passkeyOptions(
        client,
        credentials.password,
        twoFactor ? credentials.code : undefined,
      );
      if (options.status !== "ok") return options;
      const credential = (await navigator.credentials.create({
        publicKey: creationOptions(options.publicKey),
      })) as PublicKeyCredential | null;
      if (!credential) return { status: "cancelled" as const };
      await createPasskey(client, name.trim(), registrationJson(credential));
      return { status: "ok" as const };
    },
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    try {
      const result = await create.mutateAsync();
      if (result.status === "wrong-password") return setProblem(m.settings_password_wrong());
      if (result.status === "refused")
        return setProblem(m.passkeys_refused({ reason: result.reason }));
      if (result.status === "cancelled") return;
      toast.show(m.passkeys_created());
      onDone();
    } catch (error) {
      if (!isCancelled(error)) setProblem((error as Error).message);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 border-t border-border pt-4">
      <Label>
        {m.passkeys_name()}
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={m.passkeys_name_placeholder()}
          maxLength={60}
          required
        />
      </Label>
      <CredentialFields
        value={credentials}
        onChange={setCredentials}
        withCode={Boolean(twoFactor)}
      />
      {problem ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {problem}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {m.passkeys_create()}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {m.contacts_cancel()}
        </Button>
      </div>
    </form>
  );
};

export const PasskeysCard = () => {
  const { data: list, isError } = usePasskeys();
  const [adding, setAdding] = useState(false);
  // Before Stalwart 1.1.0 there is no x:Passkey; on an updated server the role may lack the rights.
  if (isError) return null;
  const supported = passkeysSupported();
  return (
    <SettingsCard title={m.passkeys_title()} description={m.passkeys_hint()}>
      {list?.length ? (
        <ul aria-label={m.passkeys_list()} className="m-0 flex list-none flex-col gap-3 p-0">
          {list.map((passkey) => (
            <PasskeyRow key={passkey.id} passkey={passkey} />
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] text-muted">{m.passkeys_none()}</p>
      )}
      {!supported ? (
        <p className="m-0 text-[13px] text-muted">{m.passkeys_unsupported()}</p>
      ) : adding ? (
        <NewPasskeyForm onDone={() => setAdding(false)} />
      ) : (
        <Button variant="primary" className="self-start" onClick={() => setAdding(true)}>
          {m.passkeys_add()}
        </Button>
      )}
    </SettingsCard>
  );
};
