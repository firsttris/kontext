/**
 * A soft ring while a call comes in (and the caller's ringback), made with Web Audio so no sound
 * file has to ship. Browsers may refuse sound before the first click; then it stays quiet.
 */
const RING_MS = 1200;
const PAUSE_MS = 2800;

/** Starts ringing; the function it returns stops it. */
export const startRinging = (volume = 0.08): (() => void) => {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return () => undefined;
  let context: AudioContext;
  try {
    context = new AudioContextClass();
  } catch {
    return () => undefined;
  }
  const ring = () => {
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.05);
    gain.gain.setValueAtTime(volume, now + RING_MS / 1000 - 0.05);
    gain.gain.linearRampToValueAtTime(0, now + RING_MS / 1000);
    gain.connect(context.destination);
    // Two tones a little apart, like a phone.
    for (const frequency of [440, 480]) {
      const tone = context.createOscillator();
      tone.frequency.value = frequency;
      tone.connect(gain);
      tone.start(now);
      tone.stop(now + RING_MS / 1000);
    }
  };
  ring();
  const timer = setInterval(ring, RING_MS + PAUSE_MS);
  return () => {
    clearInterval(timer);
    void context.close().catch(() => undefined);
  };
};
