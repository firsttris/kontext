/**
 * The tour on the first start: a few cards, each pointing at a real place (the rail or the tab
 * bar, "Neue E-Mail", a shared mailbox like info@), for people new to such programs. A modal
 * dialog (Radix): the focus stays in the card, Escape skips. Shown until it is finished or
 * skipped, once per person and device (./seen.ts); the menu starts it again.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "@/components/shell/session";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/components/use-media-query";
import { useMailAccounts } from "@/features/mail/queries";
import { cn } from "@/lib/cn";
import {
  type Box,
  cardPosition,
  isLastStep,
  type Size,
  type TourScreen,
  type TourStepId,
  tourBack,
  tourNext,
  tourSteps,
} from "@/lib/tour";
import { m } from "@/paraglide/messages";
import { markTourSeen, useTourSeen } from "./seen";

/** Each step's words; some say where to look, which differs between rail and tab bar. */
const TEXTS: Record<TourStepId, { title: () => string; text: (screen: TourScreen) => string }> = {
  welcome: { title: m.tour_welcome_title, text: () => m.tour_welcome_text() },
  mail: {
    title: m.tour_mail_title,
    text: (screen) => (screen === "phone" ? m.tour_mail_text_phone() : m.tour_mail_text_desktop()),
  },
  compose: { title: m.tour_compose_title, text: () => m.tour_compose_text() },
  shared: {
    title: m.tour_shared_title,
    text: (screen) =>
      screen === "phone" ? m.tour_shared_text_phone() : m.tour_shared_text_desktop(),
  },
  calendar: { title: m.tour_calendar_title, text: () => m.tour_calendar_text() },
  chat: { title: m.tour_chat_title, text: () => m.tour_chat_text() },
};

/** The first of the named places that is shown on the page, e.g. the rail but not the tab bar. */
const findTarget = (targets: readonly string[]): HTMLElement | null => {
  for (const name of targets) {
    for (const element of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return element;
    }
  }
  return null;
};

const boxOf = (element: HTMLElement | null): Box | null => {
  if (!element) return null;
  const { top, left, width, height } = element.getBoundingClientRect();
  return { top, left, width, height };
};

const sameBox = (a: Box | null, b: Box | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height);

/**
 * Where the step's target is, kept up to date: it may appear late (the folders load after the
 * session) or move (the window changes size).
 */
const useTargetBox = (targets: readonly string[]): Box | null => {
  const [box, setBox] = useState<Box | null>(null);
  const key = targets.join(" ");
  useLayoutEffect(() => {
    const names = key ? key.split(" ") : [];
    findTarget(names)?.scrollIntoView({ block: "nearest" });
    const measure = () => {
      const next = boxOf(findTarget(names));
      setBox((current) => (sameBox(current, next) ? current : next));
    };
    measure();
    const timer = window.setInterval(measure, 250);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [key]);
  return box;
};

/** The size of the card, measured after each render (its text differs from step to step). */
const useSize = (ref: RefObject<HTMLElement | null>): Size | null => {
  const [size, setSize] = useState<Size | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const next = { width: element.offsetWidth, height: element.offsetHeight };
    setSize((current) =>
      current?.width === next.width && current.height === next.height ? current : next,
    );
  });
  return size;
};

/** The target lit up, the rest of the screen dimmed around it. */
const Spotlight = ({ box }: { box: Box }) => (
  <div
    aria-hidden="true"
    className="pointer-events-none fixed z-40 rounded-[12px] ring-2 ring-primary motion-safe:transition-all motion-safe:duration-200"
    style={{
      top: box.top - 4,
      left: box.left - 4,
      width: box.width + 8,
      height: box.height + 8,
      boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.35)",
    }}
  />
);

const Progress = ({ step, count }: { step: number; count: number }) => (
  <div className="flex items-center gap-2">
    <span className="text-[12px] text-muted">{m.tour_step({ step: step + 1, count })}</span>
    <span aria-hidden="true" className="flex gap-1">
      {Array.from({ length: count }, (_, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: the dots are the steps, in their order
          key={index}
          className={cn("size-1.5 rounded-full", index === step ? "bg-fg" : "bg-border")}
        />
      ))}
    </span>
  </div>
);

const TourCard = ({ user }: { user: string }) => {
  const screen: TourScreen = useMediaQuery("(min-width: 768px)") ? "desktop" : "phone";
  const shared = useMailAccounts().some((account) => account.kind === "shared");
  const steps = tourSteps(screen, { shared });
  const [step, setStep] = useState(0);
  const state = { step: Math.min(step, steps.length - 1), count: steps.length };
  const current = steps[state.step]!;
  const box = useTargetBox(current.targets);
  const card = useRef<HTMLDivElement>(null);
  const size = useSize(card);
  const next = useRef<HTMLButtonElement>(null);
  const position = size
    ? cardPosition(box, { width: window.innerWidth, height: window.innerHeight }, size)
    : null;
  const done = () => markTourSeen(user);
  const last = isLastStep(state);
  const texts = TEXTS[current.id];
  const back = () => {
    const before = tourBack(state).step;
    setStep(before);
    // "Zurück" is gone on the first step; the focus goes on to "Weiter", not to the page.
    if (before === 0) next.current?.focus();
  };
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && done()}>
      <DialogPrimitive.Portal>
        {position && box ? (
          <Spotlight box={box} />
        ) : (
          <div aria-hidden="true" className="fixed inset-0 z-40 bg-black/35" />
        )}
        <DialogPrimitive.Content
          ref={card}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            next.current?.focus();
          }}
          // A click beside the card is no wish to skip; Escape and "Überspringen" are.
          onPointerDownOutside={(event) => event.preventDefault()}
          style={position ?? undefined}
          className={cn(
            "fixed z-50 flex w-[min(340px,calc(100vw-16px))] flex-col gap-3 rounded-2xl border border-border bg-bg p-4 text-fg shadow-xl outline-none",
            position ? null : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            "motion-safe:transition-[top,left] motion-safe:duration-200",
          )}
        >
          <Progress step={state.step} count={state.count} />
          <div className="flex flex-col gap-1.5">
            <DialogPrimitive.Title className="m-0 text-[16px] font-semibold">
              {texts.title()}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="m-0 text-[14px] leading-relaxed text-muted">
              {texts.text(screen)}
              {last ? (
                <> {screen === "phone" ? m.tour_again_phone() : m.tour_again_desktop()}</>
              ) : null}
            </DialogPrimitive.Description>
          </div>
          <div className="flex items-center gap-2">
            {last ? null : (
              <Button variant="ghost" size="sm" className="-ml-2" onClick={done}>
                {m.tour_skip()}
              </Button>
            )}
            <div className="flex-1" />
            {state.step > 0 ? (
              <Button size="sm" onClick={back}>
                {m.tour_back()}
              </Button>
            ) : null}
            <Button
              ref={next}
              variant="primary"
              size="sm"
              onClick={() => {
                const following = tourNext(state);
                if (following) setStep(following.step);
                else done();
              }}
            >
              {last ? m.tour_done() : m.tour_next()}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

/** The tour, while the signed-in person has not seen it on this device. */
export const Tour = () => {
  const user = useSession().data?.username ?? "";
  const seen = useTourSeen();
  return user && !seen.has(user) ? <TourCard user={user} /> : null;
};
