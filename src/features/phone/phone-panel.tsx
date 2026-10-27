/**
 * A phone call in Kontext (loaded only when one starts): the other side through LiveKit SIP and
 * the box, mute, a keypad for menus ("Drücken Sie die 1"), hang up. Bottom right on a desktop,
 * the whole screen on a phone; it closes when the call has ended.
 */
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useAudioPlayback,
  useLocalParticipant,
  useTrackToggle,
} from "@livekit/components-react";
import { useQueryClient } from "@tanstack/react-query";
import { Track } from "livekit-client";
import {
  ArrowRightLeft,
  DoorOpen,
  Grid3x3,
  Mic,
  MicOff,
  Pause,
  PhoneOff,
  Play,
  Square,
  Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { useChatNames } from "@/features/chat/use-chat-names";
import { useMe } from "@/features/tasks/queries";
import { callDuration } from "@/lib/calls";
import { cn } from "@/lib/cn";
import { handedOver, linesOf, type PhoneCall, readableNumber } from "@/lib/phone";
import { m } from "@/paraglide/messages";
import { type ActivePhone, leavePhone } from "./phone-store";
import { hangupPhone, holdPhone, openDoor, recordPhone, usePhone } from "./queries";
import { HandoverStatus, TransferForm } from "./transfer";
import { useCallerName } from "./use-caller";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
/** RFC 4733 event codes: digits as they are, * and # after them. */
const dtmfCode = (key: string) => (key === "*" ? 10 : key === "#" ? 11 : Number(key));

const useNow = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
};

const roundButton = (active: boolean) =>
  cn(
    "flex size-12 items-center justify-center rounded-full transition-colors",
    active ? "bg-subtle text-fg hover:bg-hover" : "bg-fg text-bg hover:opacity-90",
  );

const Controls = ({ call }: { call: PhoneCall }) => {
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const { localParticipant } = useLocalParticipant();
  const [keypad, setKeypad] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const { canPlayAudio, startAudio } = useAudioPlayback();
  const { calls, recordingEnabled } = usePhone();
  const queryClient = useQueryClient();
  const toast = useToast();
  const failed = (error: Error) => toast.show(m.phone_failed({ message: error.message }), "error");
  const hold = () => void holdPhone(queryClient, call.id, !call.held).catch(failed);
  const recording = call.recording === "running";
  const record = () => void recordPhone(queryClient, call.id, !recording).catch(failed);
  // Hanging up ends the call and the lines dialled into it.
  const me = useMe();
  // With a colleague still in the call, one only leaves; otherwise hanging up ends the call and
  // the lines dialled into it.
  const othersHere = call.present.some((person) => person !== me);
  const hangup = () => {
    if (!othersHere) {
      for (const line of [call, ...linesOf(calls, call)]) void hangupPhone(line.id);
    }
    leavePhone();
  };
  return (
    <div className="flex flex-col items-center gap-4">
      {keypad ? (
        <fieldset aria-label={m.phone_keypad()} className="m-0 grid grid-cols-3 gap-2 border-0 p-0">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => void localParticipant.publishDtmf(dtmfCode(key), key)}
              className="flex size-12 items-center justify-center rounded-full bg-subtle font-mono text-[18px] hover:bg-hover"
            >
              {key}
            </button>
          ))}
        </fieldset>
      ) : null}
      {call.door ? (
        <button
          type="button"
          onClick={() => void openDoor(queryClient, call.id).catch(failed)}
          className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-1.5 text-[13px] hover:bg-hover"
        >
          <DoorOpen size={14} /> {m.phone_door_open()}
        </button>
      ) : null}
      {recordingEnabled && call.state === "talking" ? (
        <button
          type="button"
          aria-pressed={recording}
          onClick={record}
          disabled={call.held}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] disabled:opacity-40",
            recording ? "bg-danger text-white" : "bg-subtle hover:bg-hover",
          )}
        >
          {recording ? <Square size={12} /> : <span className="size-2.5 rounded-full bg-danger" />}
          {recording ? m.phone_record_stop() : m.phone_record()}
        </button>
      ) : null}
      {transfer ? <TransferForm call={call} onDone={() => setTransfer(false)} /> : null}
      <HandoverStatus call={call} />
      {canPlayAudio ? null : (
        <button
          type="button"
          onClick={() => void startAudio()}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-[13px] text-onprimary"
        >
          <Volume2 size={14} />
          {m.call_play_audio()}
        </button>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={mic.enabled ? m.call_mic_off() : m.call_mic_on()}
          title={mic.enabled ? m.call_mic_off() : m.call_mic_on()}
          aria-pressed={mic.enabled}
          onClick={() => void mic.toggle()}
          className={roundButton(mic.enabled)}
        >
          {mic.enabled ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        <button
          type="button"
          aria-label={m.phone_keypad()}
          title={m.phone_keypad()}
          aria-pressed={keypad}
          onClick={() => setKeypad((open) => !open)}
          className={roundButton(true)}
        >
          <Grid3x3 size={18} />
        </button>
        <button
          type="button"
          aria-label={call.held ? m.phone_resume() : m.phone_hold()}
          title={call.held ? m.phone_resume() : m.phone_hold()}
          aria-pressed={call.held}
          disabled={call.state !== "talking"}
          onClick={hold}
          className={cn(roundButton(!call.held), "disabled:opacity-40")}
        >
          {call.held ? <Play size={18} /> : <Pause size={18} />}
        </button>
        <button
          type="button"
          aria-label={m.phone_transfer()}
          title={m.phone_transfer()}
          aria-pressed={transfer}
          disabled={call.state !== "talking"}
          onClick={() => setTransfer((open) => !open)}
          className={cn(roundButton(true), "disabled:opacity-40")}
        >
          <ArrowRightLeft size={18} />
        </button>
        <button
          type="button"
          aria-label={othersHere ? m.phone_leave_call() : m.call_leave()}
          title={othersHere ? m.phone_leave_call() : m.call_leave()}
          onClick={hangup}
          className="flex size-12 items-center justify-center rounded-full bg-danger text-white hover:opacity-90"
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
};

const PhoneView = ({ call }: { call: PhoneCall }) => {
  const caller = useCallerName(call.remote);
  const now = useNow();
  const status = call.held
    ? m.phone_held()
    : call.state === "talking" && call.answeredAt
      ? callDuration(call.answeredAt, now)
      : call.direction === "out"
        ? m.phone_dialing()
        : m.call_connecting();
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <Avatar name={caller.name} photo={caller.photo} size={64} />
        <span className="text-[16px] font-semibold">{caller.name}</span>
        {caller.contact ? (
          <span className="text-[13px] text-muted">{readableNumber(call.remote)}</span>
        ) : null}
        <span role="status" className="font-mono text-[12px] text-muted tabular-nums">
          {status}
        </span>
      </div>
      <Controls call={call} />
      <RoomAudioRenderer />
    </>
  );
};

export const PhonePanel = ({ active }: { active: ActivePhone }) => {
  const toast = useToast();
  const { calls } = usePhone();
  const me = useMe();
  const { nameOf } = useChatNames();
  const call = calls.find((candidate) => candidate.id === active.callId);
  const caller = useCallerName(call?.remote ?? "");
  // The other side hung up, or the box ended it: the panel goes.
  const ended = call?.state === "ended";
  useEffect(() => {
    if (ended) leavePhone();
  }, [ended]);
  // Handed to a colleague who is in the call now: I go – only if it was mine; a colleague who
  // was asked to join stays.
  const wasMine = useRef(false);
  if (call?.member === me) wasMine.current = true;
  const gone = call ? wasMine.current && handedOver(call, me) : false;
  const takenBy = call?.member ?? "";
  useEffect(() => {
    if (!gone) return;
    toast.show(m.phone_transfer_done({ name: nameOf(takenBy) }));
    leavePhone();
  }, [gone, takenBy, nameOf, toast]);
  if (!call) return null;
  return (
    <LiveKitRoom
      serverUrl={active.url}
      token={active.token}
      connect
      audio
      video={false}
      onError={() => toast.show(m.call_failed(), "error")}
      onMediaDeviceFailure={() => toast.show(m.call_no_device(), "error")}
      aria-label={m.phone_panel({ name: caller.name })}
      role="region"
      className="fixed inset-0 z-50 flex flex-col gap-4 bg-bg p-5 safe-top safe-bottom md:inset-auto md:right-4 md:bottom-4 md:h-[420px] md:w-[320px] md:rounded-2xl md:border md:border-border md:shadow-2xl"
    >
      <PhoneView call={call} />
    </LiveKitRoom>
  );
};
