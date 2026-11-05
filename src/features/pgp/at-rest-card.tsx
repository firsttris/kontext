/**
 * Settings: let Stalwart keep new mails encrypted with one's own public key (docs/encryption.md,
 * "Auf dem Server verschlüsselt ablegen"). Kontext opens them like any PGP mail.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import {
  ensurePublicKey,
  getEncryptionAtRest,
  registeredKeyId,
  setEncryptionAtRest,
} from "@/jmap/encryption-at-rest";
import { m } from "@/paraglide/messages";
import { useSave } from "../settings/queries";
import { SettingsCard } from "../settings/settings-page";
import { type OwnKey, useOwnKey } from "./queries";

const KEY = ["settings", "encryptionAtRest"];

type Choice = { on: boolean; encryptOnAppend: boolean };

/**
 * Before one's key goes: switch encryption at rest off, or Stalwart keeps encrypting every new
 * mail for a key nobody holds any more. Throws when Stalwart refuses, so the key stays.
 */
export const useStopAtRest = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  return async () => {
    if ((await getEncryptionAtRest(client))["@type"] === "Enabled")
      await setEncryptionAtRest(client, { "@type": "Disabled" });
    await queryClient.invalidateQueries({ queryKey: KEY });
  };
};

export const AtRestCard = () => {
  const { data: own } = useOwnKey();
  return (
    <SettingsCard title={m.pgp_at_rest_title()} description={m.pgp_at_rest_hint()}>
      {own === undefined ? null : <AtRestSwitches own={own} />}
      <p className="m-0 text-[12px] text-muted">{m.pgp_at_rest_note()}</p>
    </SettingsCard>
  );
};

/** Without a key of one's own it can only be switched off (the key went while it was on). */
const AtRestSwitches = ({ own }: { own: OwnKey | null }) => {
  const client = useClient();
  const toast = useToast();
  const { data } = useQuery({
    queryKey: [...KEY, own?.fingerprint ?? null],
    queryFn: async () => ({
      state: await getEncryptionAtRest(client),
      ownId: own ? await registeredKeyId(client, own.fingerprint) : undefined,
    }),
  });
  const save = useSave(
    async ({ on, encryptOnAppend }: Choice) =>
      setEncryptionAtRest(
        client,
        on && own
          ? {
              "@type": "Enabled",
              publicKey: await ensurePublicKey(client, own.publicKey, own.fingerprint),
              encryptOnAppend,
            }
          : { "@type": "Disabled" },
      ),
    [KEY],
  );
  if (!data) return null;
  const { state, ownId } = data;
  const on = state["@type"] === "Enabled";
  if (!own && !on) return <p className="m-0 text-[13px] text-muted">{m.pgp_at_rest_no_key()}</p>;
  const encryptOnAppend = state["@type"] === "Enabled" && Boolean(state.encryptOnAppend);
  const choose = (choice: Choice) =>
    save.mutate(choice, {
      onSuccess: () => toast.show(choice.on ? m.pgp_at_rest_enabled() : m.pgp_at_rest_disabled()),
      onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
    });
  return (
    <div className="flex flex-col gap-2">
      <Switch
        checked={on}
        disabled={save.isPending}
        onChange={(next) => choose({ on: next, encryptOnAppend })}
      >
        {m.pgp_at_rest_switch()}
      </Switch>
      {on && own ? (
        <Switch
          checked={encryptOnAppend}
          disabled={save.isPending}
          onChange={(next) => choose({ on: true, encryptOnAppend: next })}
        >
          {m.pgp_at_rest_append()}
        </Switch>
      ) : null}
      {/* A key made anew (or gone) after switching on: Stalwart still encrypts for the old one. */}
      {state["@type"] === "Enabled" && state.publicKey !== ownId ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {m.pgp_at_rest_other_key()}
        </p>
      ) : null}
    </div>
  );
};
