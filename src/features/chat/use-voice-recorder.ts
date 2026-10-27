/**
 * Recording a voice message with the microphone: `start` asks for it (the browser asks the person
 * the first time), `stop` gives the recording as a file, `discard` throws it away. The microphone
 * is let go as soon as the recording ends, also when the conversation closes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { recordingType, voiceFile } from "@/lib/voice";
import { m } from "@/paraglide/messages";
import { stopVoiceMessage } from "./voice-message";

type Session = {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  timer: ReturnType<typeof setInterval>;
};

const release = ({ stream, timer }: Session) => {
  clearInterval(timer);
  for (const track of stream.getTracks()) track.stop();
};

export const useVoiceRecorder = ({ onError }: { onError: (message: string) => void }) => {
  const session = useRef<Session | null>(null);
  // The browser may take a while to answer (it asks the person the first time): meanwhile a second
  // click starts nothing, and a conversation closed in between gets no recording.
  const asking = useRef(false);
  const mounted = useRef(true);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

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
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (mounted.current) onError(m.chat_voice_denied());
      return;
    } finally {
      asking.current = false;
    }
    if (!mounted.current) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    const type = recordingType((candidate) => MediaRecorder.isTypeSupported(candidate));
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const startedAt = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
    session.current = { recorder, stream, chunks, timer };
    recorder.start();
    setSeconds(0);
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
    start,
    stop: useCallback(() => finish(true), [finish]),
    discard: useCallback(() => void finish(false), [finish]),
  };
};
