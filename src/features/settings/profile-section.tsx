import { type FormEvent, useEffect, useState } from "react";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { PhotoPicker } from "@/features/photos/photo-picker";
import { useOwnPhoto } from "@/features/photos/queries";
import { updateAccountSettings, updateIdentity } from "@/jmap/settings";
import { LOCALE } from "@/lib/locale";
import { m } from "@/paraglide/messages";
import {
  useAccountSettings,
  usePersonalAccountId,
  usePersonalIdentities,
  useSave,
} from "./queries";
import { SettingsCard } from "./settings-page";

/** The photo and name shown to colleagues; the name also as sender name of the own address. */
export const ProfileSection = () => {
  const client = useClient();
  const toast = useToast();
  const { data: session } = useSession();
  const accountId = usePersonalAccountId();
  const { data: settings } = useAccountSettings();
  const { data: identities = [] } = usePersonalIdentities();
  const [name, setName] = useState("");

  useEffect(() => {
    if (settings) setName(settings.description ?? "");
  }, [settings]);

  const save = useSave(
    async (value: string) => {
      await updateAccountSettings(client, {
        description: value,
        locale: LOCALE,
        timeZone: "Europe/Berlin",
      });
      const own = identities.find((i) => i.email.toLowerCase() === session?.username.toLowerCase());
      if (own && accountId) await updateIdentity(client, accountId, own.id, { name: value });
    },
    [
      ["settings", "account"],
      [accountId, "identities"],
    ],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await save.mutateAsync(name.trim());
      toast.show(m.settings_saved());
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <SettingsCard title={m.settings_profile()} description={session?.username}>
      <OwnPhoto name={name || session?.username || ""} />
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Label>
          {m.settings_name()}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
        </Label>
        <Button type="submit" variant="primary" className="self-start" disabled={save.isPending}>
          {m.contacts_save()}
        </Button>
      </form>
    </SettingsCard>
  );
};

const OwnPhoto = ({ name }: { name: string }) => {
  const toast = useToast();
  const photo = useOwnPhoto();
  const run = async (change: () => Promise<unknown>, done: string) => {
    try {
      await change();
      toast.show(done);
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <PhotoPicker
        name={name}
        photo={photo.url}
        busy={photo.busy}
        onPick={(file) => void run(() => photo.set(file), m.photo_saved())}
        onRemove={() => void run(() => photo.remove(), m.photo_removed())}
      />
      <p className="m-0 text-[13px] text-muted">{m.settings_photo_hint()}</p>
    </div>
  );
};
