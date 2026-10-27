/** The card above the mail list that offers notifications on this device (see `offer.ts`). */
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import { isApple, useInstalled } from "@/pwa/install";
import {
  notificationsSupported,
  postponeOffer,
  setDeviceNotifications,
  useDeviceChosen,
  usePostponed,
} from "./device-settings";
import { lastOffer, offerDue, offerKind } from "./offer";

export const PushOffer = () => {
  const toast = useToast();
  const kind = offerKind({
    chosen: useDeviceChosen(),
    supported: notificationsSupported(),
    apple: isApple(),
    installed: useInstalled(),
  });
  const postponed = usePostponed(kind ?? "push");
  if (!kind || !offerDue(postponed, Date.now())) return null;

  const switchOn = async () => {
    if (!(await setDeviceNotifications(true))) toast.show(m.notifications_device_denied(), "error");
  };
  return (
    <section
      aria-label={m.push_offer_title()}
      className="mx-4 mb-3 flex gap-3 rounded-xl border border-border p-3"
    >
      <BellRing size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="m-0 text-[13px] font-medium">{m.push_offer_title()}</p>
        <p className="m-0 text-[12px] text-muted">
          {kind === "push" ? m.push_offer_hint() : m.push_offer_install()}
        </p>
        <div className="flex gap-2">
          {kind === "push" ? (
            <Button variant="primary" size="sm" onClick={() => void switchOn()}>
              {m.push_offer_on()}
            </Button>
          ) : null}
          <Button size="sm" onClick={() => postponeOffer(kind, postponed, Date.now())}>
            {lastOffer(postponed) ? m.push_offer_never() : m.push_offer_later()}
          </Button>
        </div>
      </div>
    </section>
  );
};
