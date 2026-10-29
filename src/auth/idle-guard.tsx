/**
 * Abmelden nach Inaktivität: while the Firmenverwaltung has set a time, every page of the signed-in
 * app counts the time without input (pointer, keys, the tab coming into view, a running call) and
 * asks „Angemeldet bleiben?“ before it runs out. Without an answer the open mails are saved as
 * drafts and Kontext signs out the usual way, back to the login. The state machine is in
 * src/lib/idle-logout.ts; the time is shared across the browser's tabs through localStorage.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useCallStore } from "@/features/calls/call-store";
import { useIdleLogout } from "@/features/company/idle-logout";
import { flushDrafts } from "@/features/mail/draft-flush";
import {
  countdownText,
  createIdleTimer,
  IDLE_STORAGE_KEY,
  type IdlePhase,
  type IdleTimer,
  secondsLeft,
} from "@/lib/idle-logout";
import { m } from "@/paraglide/messages";
import { useAuth } from "./auth";
import { idleStore } from "./idle-store";

/** What counts as someone at the computer. */
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

/** A call has no input for long stretches; it counts as activity this often. */
const CALL_BEAT_MS = 20_000;

/** The timer for `minutes` (none while 0), fed by this tab's input and the other tabs' writes. */
const useIdleTimer = (minutes: number) => {
  const [phase, setPhase] = useState<IdlePhase>("active");
  const [timer, setTimer] = useState<IdleTimer | null>(null);
  useEffect(() => {
    setPhase("active");
    if (!minutes) return setTimer(null);
    const next = createIdleTimer({
      timeoutMs: minutes * 60_000,
      store: idleStore,
      onPhase: setPhase,
    });
    setTimer(next);
    setPhase(next.phase());
    const onActivity = () => next.activity();
    const onStorage = (event: StorageEvent) => {
      if (event.key === IDLE_STORAGE_KEY) next.check();
    };
    // Back in view: a timer held back in the background catches up first, then it counts.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      next.check();
      next.activity();
    };
    const options = { capture: true, passive: true };
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, onActivity, options);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity, options);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      next.stop();
    };
  }, [minutes]);

  const inCall = useCallStore().active !== null;
  useEffect(() => {
    if (!timer || !inCall) return;
    timer.activity();
    const beat = setInterval(() => timer.activity(), CALL_BEAT_MS);
    return () => clearInterval(beat);
  }, [timer, inCall]);

  return { phase, timer };
};

/** Saves the open mails, then signs out the way the menu does; once. */
const useSignOutOnce = () => {
  const { logout } = useAuth();
  const started = useRef(false);
  return async () => {
    if (started.current) return;
    started.current = true;
    await flushDrafts();
    await logout();
  };
};

export const IdleGuard = () => {
  const { phase, timer } = useIdleTimer(useIdleLogout());
  const signOut = useSignOutOnce();
  useEffect(() => {
    if (phase === "expired") void signOut();
  });
  if (!timer || phase === "active") return null;
  return <StayDialog timer={timer} onLogout={() => void signOut()} />;
};

const StayDialog = ({ timer, onLogout }: { timer: IdleTimer; onLogout: () => void }) => {
  const left = () => secondsLeft(Date.now(), timer.expiresAt());
  const [seconds, setSeconds] = useState(left);
  useEffect(() => {
    const tick = setInterval(() => setSeconds(left()), 1000);
    return () => clearInterval(tick);
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && timer.stay()}
      title={m.idle_title()}
      description={m.idle_hint()}
    >
      <div
        role="timer"
        aria-label={m.idle_countdown({ time: countdownText(seconds) })}
        className="text-center text-[32px] font-semibold tabular-nums"
      >
        {countdownText(seconds)}
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onLogout}>{m.logout()}</Button>
        <Button variant="primary" onClick={() => timer.stay()}>
          {m.idle_stay()}
        </Button>
      </div>
    </Dialog>
  );
};
