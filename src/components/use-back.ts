/**
 * "Zurück" on a screen opened from another one (a conversation from the list, a thread from the
 * conversation): back in the browser's history, so a swipe back afterwards does not land on this
 * screen again. Opened from elsewhere (a link, a notification, a reload), there is no such entry
 * before it; then the screen to return to takes this one's place.
 */
import { useRouter } from "@tanstack/react-router";

declare module "@tanstack/history" {
  interface HistoryState {
    /** The entry before this one is the screen its "Zurück" leads to. */
    fromParent?: boolean;
  }
}

/** For `navigate` and `<Link>`: open a screen whose "Zurück" leads to the current one. */
export const FROM_PARENT = { fromParent: true } as const;

export const useBack = () => {
  const router = useRouter();
  return (replaceWithParent: () => void) => {
    if (router.state.location.state.fromParent) router.history.back();
    else replaceWithParent();
  };
};
