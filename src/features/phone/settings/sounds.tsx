/**
 * Firmenverwaltung → Telefonie → Ansagen: greetings the box plays (mailbox, later closing times
 * and the menu). Spoken into the browser or uploaded as any audio file; the browser turns it into
 * the telephone's WAV before it goes to the server.
 */
import { Mic, Square, Upload } from "lucide-react";
import { type ComponentProps, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { SettingsCard } from "@/features/settings/settings-page";
import { toPhoneWav } from "@/lib/wav";
import { m } from "@/paraglide/messages";
import { soundLength } from "../../../../server/phone/sounds";
import { type Admin, send, useAdminChange } from "./api";

const uploadSound = async (name: string, audio: Blob) => {
  const wav = await toPhoneWav(audio);
  const response = await fetch(`/api/company/phone/sounds?name=${encodeURIComponent(name)}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "audio/wav" },
    body: new Uint8Array(wav),
  });
  const result = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
};

/** The microphone while one speaks the greeting; the recording when one stops. */
const useRecorder = (onDone: (audio: Blob) => void) => {
  const recorder = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: Blob[] = [];
    const next = new MediaRecorder(stream);
    next.ondataavailable = (event) => chunks.push(event.data);
    next.onstop = () => {
      for (const track of stream.getTracks()) track.stop();
      setRecording(false);
      onDone(new Blob(chunks, { type: next.mimeType }));
    };
    next.start();
    recorder.current = next;
    setRecording(true);
  };
  return { recording, start, stop: () => recorder.current?.stop() };
};

export const SoundsCard = ({ sounds }: { sounds: Admin["sounds"] }) => {
  const toast = useToast();
  const [name, setName] = useState("");
  const add = useAdminChange(({ title, audio }: { title: string; audio: Blob }) =>
    uploadSound(title, audio),
  );
  const remove = useAdminChange((id: string) =>
    send("DELETE", `/sounds/${encodeURIComponent(id)}`),
  );
  const save = async (audio: Blob) => {
    await add.mutateAsync({ title: name.trim() || m.phone_sound_default(), audio });
    setName("");
    toast.show(m.phone_sound_saved());
  };
  const recorder = useRecorder((audio) => void save(audio));
  return (
    <SettingsCard title={m.phone_sounds()} description={m.phone_sounds_hint()}>
      {sounds.length ? (
        <ul aria-label={m.phone_sounds()} className="m-0 flex list-none flex-col gap-2 p-0">
          {sounds.map((sound) => (
            <li key={sound.id} className="flex flex-wrap items-center gap-2 text-[14px]">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{sound.name}</span>
                <span className="text-muted"> · {soundLength(sound.seconds)}</span>
              </span>
              {/* biome-ignore lint/a11y/useMediaCaption: a spoken greeting, its name says what it is */}
              <audio
                controls
                preload="none"
                src={`/api/company/phone/sounds/${sound.id}`}
                aria-label={sound.name}
                className="h-8"
              />
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(sound.id)}>
                {m.phone_sound_remove()}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] text-muted">{m.phone_sounds_none()}</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Label className="min-w-0 flex-1">
          {m.phone_sound_name()}
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={m.phone_sound_default()}
          />
        </Label>
        {recorder.recording ? (
          <Button variant="danger" onClick={recorder.stop}>
            <Square size={14} /> {m.phone_sound_stop()}
          </Button>
        ) : (
          <Button
            disabled={add.isPending}
            onClick={() =>
              void recorder.start().catch(() => toast.show(m.call_no_device(), "error"))
            }
          >
            <Mic size={14} /> {m.phone_sound_record()}
          </Button>
        )}
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-[14px] hover:bg-hover">
          <Upload size={14} /> {m.phone_sound_upload()}
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void save(file);
            }}
          />
        </label>
      </div>
    </SettingsCard>
  );
};

/** Picks one of the greetings; `none` says what happens without one. */
export const SoundSelect = ({
  sounds,
  none,
  ...props
}: { sounds: Admin["sounds"]; none: string } & Omit<ComponentProps<typeof Select>, "children">) => (
  <Select {...props}>
    <option value="">{none}</option>
    {sounds.map((sound) => (
      <option key={sound.id} value={sound.id}>
        {sound.name}
      </option>
    ))}
  </Select>
);
