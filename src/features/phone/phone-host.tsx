/** Telephony across the whole app: the ring of a phone call and the panel of the one I am in. */
import { lazy, Suspense } from "react";
import { IncomingPhone } from "./incoming-phone";
import { usePhoneStore } from "./phone-store";
import { usePhone } from "./queries";

const PhonePanel = lazy(async () => ({ default: (await import("./phone-panel")).PhonePanel }));

export const PhoneHost = () => {
  const { enabled, allowed } = usePhone();
  const { active } = usePhoneStore();
  if (!enabled || !allowed) return null;
  return (
    <>
      <IncomingPhone />
      {active ? (
        <Suspense fallback={null}>
          <PhonePanel key={active.callId} active={active} />
        </Suspense>
      ) : null}
    </>
  );
};
