/** The moment of the last input, shared by every tab of this browser (src/lib/idle-logout.ts). */
import { storageIdleStore } from "@/lib/idle-logout";

export const idleStore = storageIdleStore(() =>
  typeof window === "undefined" ? undefined : window.localStorage,
);

/** A sign-in starts the time anew: an old moment left by a closed tab must not sign out at once. */
export const markSignedIn = () => idleStore.write(Date.now());
