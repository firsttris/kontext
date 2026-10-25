/**
 * Firmenverwaltung → Telefonie → Gespräche aufnehmen: whether people may record a call from the
 * call panel. Before recording starts, the box plays the chosen notice to the caller (recording a
 * conversation needs the other side's consent, § 201 StGB).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { SettingsCard } from "@/features/settings/settings-page";
import { m } from "@/paraglide/messages";
import { type Admin, send, useAdminChange } from "./api";
import { SoundSelect } from "./sounds";

export const RecordingForm = ({
  recording,
  sounds,
}: {
  recording: Admin["recording"];
  sounds: Admin["sounds"];
}) => {
  const toast = useToast();
  const [enabled, setEnabled] = useState(recording.enabled);
  const [notice, setNotice] = useState(recording.notice ?? "");
  const save = useAdminChange(() => send("PUT", "/recording", { enabled, notice: notice || null }));
  return (
    <SettingsCard title={m.phone_recording_settings()} description={m.phone_recording_hint()}>
      <label className="flex items-center gap-2 text-[14px]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="size-4 accent-[var(--accent)]"
        />
        {m.phone_recording_enabled()}
      </label>
      <Label>
        {m.phone_recording_notice()}
        <SoundSelect
          sounds={sounds}
          none={m.phone_recording_no_notice()}
          value={notice}
          onChange={(event) => setNotice(event.target.value)}
          disabled={!enabled}
        />
      </Label>
      <Button
        variant="primary"
        className="self-start"
        disabled={save.isPending}
        onClick={async () => {
          await save.mutateAsync(undefined);
          toast.show(m.company_saved());
        }}
      >
        {m.company_save()}
      </Button>
    </SettingsCard>
  );
};
