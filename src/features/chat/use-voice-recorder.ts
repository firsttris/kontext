/**
 * Recording a voice message with the microphone: `start` asks for it (the browser asks the person
 * the first time), `stop` gives the recording as a file, `discard` throws it away. The microphone
 * is let go as soon as the recording ends, also when the conversation closes. Meanwhile `levels`
 * says how loud it was lately, for the waveform growing in the recorder bar.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { holdMicrophone } from "@/lib/audio-session";
import { keepLatest, liveLevel, recordingType, voiceFile } from "@/lib/voice";
import { m } from "@/paraglide/messages";
import { stopVoiceMessage } from "./voice-message";

/** How many levels the recorder bar shows. */
export const LIVE_BARS = 40;

/** How often the time and the level are read. */
const TICK_MS = 100;

type Meter = { read: () => number; close: () => void };

type Session = {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  timer: ReturnType<typeof setInterval>;
  meter: Meter | null;
  letGo: () => void;
};

/** Listens to the microphone for its level; none where Web Audio is missing or refuses. */
const meterOf = (stream: MediaStream): Meter | null => {
  if (typeof AudioContext === "undefined") return null;
  try {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);
    void context.resume().catch(() => undefined);
    const samples = new Uint8Array(analyser.fftSize);
    return {
      read: () => {
        analyser.getByteTimeDomainData(samples);
        return liveLevel(samples);
      },
      close: () => void context.close().catch(() => undefined),
    };
  } catch {
    return null;
  }
};

const release = ({ stream, timer, meter, letGo }: Session) => {
  clearInterval(timer);
  meter?.close();
  for (const track of stream.getTracks()) track.stop();
  letGo();
};

export const useVoiceRecorder = ({ onError }: { onError: (message: string) => void }) => {
  const session = useRef<Session | null>(null);
  // The browser may take a while to answer (it asks the person the first time): meanwhile a second
  // click starts nothing, and a conversation closed in between gets no recording.
  const asking = useRef(false);
  const mounted = useRef(true);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (!session.current) return;
      session.current.recorder.onstop = null;
      if (session.current.recorder.state !== "inactive") session.current.recorder.stop();
      release(session.current);
      session.current = null;
    };
  }, []);

  const start = useCallback(async () => {
    if (session.current || asking.current) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError(m.chat_voice_unsupported());
      return;
    }
    let stream: MediaStream;
    asking.current = true;
    stopVoiceMessage();
    const letGo = holdMicrophone();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      letGo();
      if (mounted.current) onError(m.chat_voice_denied());
      return;
    } finally {
      asking.current = false;
    }
    if (!mounted.current) {
      for (const track of stream.getTracks()) track.stop();
      letGo();
      return;
    }
    const type = recordingType((candidate) => MediaRecorder.isTypeSupported(candidate));
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const meter = meterOf(stream);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
      if (meter) setLevels((current) => keepLatest(current, meter.read(), LIVE_BARS));
    }, TICK_MS);
    session.current = { recorder, stream, chunks, timer, meter, letGo };
    recorder.start();
    setSeconds(0);
    setLevels([]);
    setRecording(true);
  }, [onError]);

  /** Ends the recording; the file when `keep` and something was recorded. */
  const finish = useCallback(
    (keep: boolean) =>
      new Promise<File | null>((resolve) => {
        const current = session.current;
        session.current = null;
        setRecording(false);
        if (!current) {
          resolve(null);
          return;
        }
        // The last piece of the recording arrives before "stop".
        current.recorder.onstop = () => {
          release(current);
          const type = current.recorder.mimeType || current.chunks[0]?.type || "";
          resolve(keep && current.chunks.length ? voiceFile(current.chunks, type) : null);
        };
        current.recorder.stop();
      }),
    [],
  );

  return {
    recording,
    seconds,
    levels,
    start,
    stop: useCallback(() => finish(true), [finish]),
    discard: useCallback(() => void finish(false), [finish]),
  };
};
