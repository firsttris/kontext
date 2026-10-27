/**
 * The card above the mail list: on a phone, install Kontext as an app; then, notifications on this
 * device. Which one, and when, is decided in `offer.ts`.
 */
import { BellRing, Share, Smartphone, SquarePlus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import { isApple, useInstalled, useInstallPrompt } from "@/pwa/install";
import {
  notificationsSupported,
  postponeOffer,
  setDeviceNotifications,
  useDeviceChosen,
  usePostponed,
} from "./device-settings";
import { lastOffer, offerCandidates, pickOffer } from "./offer";

/** Below `md`, where Kontext shows one screen at a time. */
const phoneSized = () => window.matchMedia("(max-width: 767px)").matches;

const OfferCard = ({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) => (
  <section aria-label={title} className="mx-4 mb-3 flex gap-3 rounded-xl border border-border p-3">
    <span className="mt-0.5 shrink-0 text-accent">{icon}</span>
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <p className="m-0 text-[13px] font-medium">{title}</p>
      {children}
    </div>
  </section>
);

/** Safari has no install button for a page to press; these are the steps through its menu. */
const AppleSteps = () => (
  <ol className="m-0 flex list-none flex-col gap-1.5 p-0 text-[12px]">
    <li className="flex gap-2">
      <Share size={15} aria-hidden="true" className="mt-px shrink-0" />
      {/* Newer iOS hides "Teilen" behind a long press on the address bar. */}
      <span className="flex flex-col">
        {m.install_offer_apple_share()}
        <span className="text-muted">{m.install_offer_apple_more()}</span>
      </span>
    </li>
    <li className="flex items-center gap-2">
      <SquarePlus size={15} aria-hidden="true" className="shrink-0" /> {m.install_offer_apple_add()}
    </li>
    <li className="flex items-center gap-2">
      <Smartphone size={15} aria-hidden="true" className="shrink-0" />{" "}
      {m.install_offer_apple_open()}
    </li>
  </ol>
);

export const DeviceOffer = () => {
  const toast = useToast();
  const install = useInstallPrompt();
  const apple = isApple();
  const postponed = usePostponed();
  const kind = pickOffer(
    offerCandidates({
      chosen: useDeviceChosen(),
      supported: notificationsSupported(),
      installed: useInstalled(),
      apple,
      promptOnPhone: install !== null && phoneSized(),
    }),
    postponed,
    Date.now(),
  );
  if (!kind) return null;

  const later = () => postponeOffer(kind, postponed[kind], Date.now());
  const laterButton = (
    <Button size="sm" onClick={later}>
      {lastOffer(postponed[kind]) ? m.offer_never() : m.offer_later()}
    </Button>
  );
  if (kind === "install") {
    // Turned down in the browser's dialog counts as "Später": the dialog cannot be shown again.
    const installNow = async () => {
      if (!(await install?.())) later();
    };
    return (
      <OfferCard icon={<Smartphone size={18} aria-hidden="true" />} title={m.install_offer_title()}>
        <p className="m-0 text-[12px] text-muted">{m.install_offer_hint()}</p>
        {apple ? <AppleSteps /> : null}
        <div className="flex gap-2">
          {install ? (
            <Button variant="primary" size="sm" onClick={() => void installNow()}>
              {m.install_offer_install()}
            </Button>
          ) : null}
          {laterButton}
        </div>
      </OfferCard>
    );
  }
  const switchOn = async () => {
    if (!(await setDeviceNotifications(true))) toast.show(m.notifications_device_denied(), "error");
  };
  return (
    <OfferCard icon={<BellRing size={18} aria-hidden="true" />} title={m.push_offer_title()}>
      <p className="m-0 text-[12px] text-muted">{m.push_offer_hint()}</p>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={() => void switchOn()}>
          {m.push_offer_on()}
        </Button>
        {laterButton}
      </div>
    </OfferCard>
  );
};
