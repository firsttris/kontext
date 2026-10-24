/** The number of unread mails on the app's icon (Badging API; installed apps, where supported). */
import { useEffect } from "react";

export const useAppBadge = (count: number) => {
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    const done = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
    void done.catch(() => undefined);
  }, [count]);
};
