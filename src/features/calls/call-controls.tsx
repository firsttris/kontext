/** The buttons of a call: microphone, camera, sharing the screen (desktop), hanging up. */
import { useTrackToggle } from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  type LucideIcon,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Video,
  VideoOff,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";

type ToggleSource = Track.Source.Microphone | Track.Source.Camera | Track.Source.ScreenShare;

const Toggle = ({
  source,
  on,
  off,
  onError,
}: {
  source: ToggleSource;
  on: { icon: LucideIcon; label: string };
  off: { icon: LucideIcon; label: string };
  onError: () => void;
}) => {
  const { toggle, enabled, pending } = useTrackToggle({ source, onDeviceError: onError });
  // The label says what a press does: "Mikrofon aus" while it is on.
  const { icon: Icon, label } = enabled ? off : on;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={enabled}
      disabled={pending}
      onClick={() => void toggle()}
      className={cn(
        "flex size-11 items-center justify-center rounded-full transition-colors disabled:opacity-50",
        enabled ? "bg-subtle text-fg hover:bg-hover" : "bg-fg text-bg hover:opacity-90",
      )}
    >
      <Icon size={18} />
    </button>
  );
};

const canShareScreen = () =>
  typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);

export const CallControls = ({
  onLeave,
  onDeviceError,
}: {
  onLeave: () => void;
  onDeviceError: () => void;
}) => (
  <div className="flex items-center justify-center gap-3">
    <Toggle
      source={Track.Source.Microphone}
      on={{ icon: MicOff, label: m.call_mic_on() }}
      off={{ icon: Mic, label: m.call_mic_off() }}
      onError={onDeviceError}
    />
    <Toggle
      source={Track.Source.Camera}
      on={{ icon: VideoOff, label: m.call_camera_on() }}
      off={{ icon: Video, label: m.call_camera_off() }}
      onError={onDeviceError}
    />
    {canShareScreen() ? (
      <span className="hidden md:contents">
        <Toggle
          source={Track.Source.ScreenShare}
          on={{ icon: MonitorUp, label: m.call_share() }}
          off={{ icon: MonitorX, label: m.call_share_stop() }}
          onError={() => undefined}
        />
      </span>
    ) : null}
    <button
      type="button"
      aria-label={m.call_leave()}
      title={m.call_leave()}
      onClick={onLeave}
      className="flex size-11 items-center justify-center rounded-full bg-danger text-white hover:opacity-90"
    >
      <PhoneOff size={18} />
    </button>
  </div>
);
