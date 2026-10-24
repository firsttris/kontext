/** The switch for system notifications on this device, in the bell and in the settings. */
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import {
  notificationsSupported,
  setDeviceNotifications,
  useDeviceNotifications,
} from "./device-settings";

export const DeviceSwitch = () => {
  const on = useDeviceNotifications();
  const toast = useToast();
  if (!notificationsSupported()) {
    return <p className="m-0 text-[13px] text-muted">{m.notifications_unsupported()}</p>;
  }
  const toggle = async (next: boolean) => {
    if (!(await setDeviceNotifications(next))) toast.show(m.notifications_device_denied(), "error");
  };
  return (
    <div className="flex flex-col gap-1">
      <Switch checked={on} onChange={(next) => void toggle(next)}>
        {m.notifications_device()}
      </Switch>
      <p className="m-0 text-[12px] text-muted">{m.notifications_device_hint()}</p>
    </div>
  );
};
