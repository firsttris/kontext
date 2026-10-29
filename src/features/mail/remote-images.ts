/**
 * Whether a mail's pictures from the internet are shown: at once for a sender one trusts (see
 * lib/remote-images.ts), or once the person loaded them for this mail. That choice is remembered
 * for the session by mail, so printing (print-mail.ts) shows the same pictures as the reading pane.
 */
import { useSyncExternalStore } from "react";
import type { EmailDetail } from "@/jmap/types";
import { findContact } from "@/lib/correspondent";
import { imageState } from "@/lib/remote-images";
import { trusts } from "../../../server/images/senders";
import { useContacts } from "../contacts/queries";
import { useImageSenders } from "./image-senders";

const loaded = new Set<string>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The person asked to see this mail's pictures from the internet. */
export const loadRemoteImages = (emailId: string) => {
  loaded.add(emailId);
  for (const listener of listeners) listener();
};

export const useRemoteImages = (
  email: Pick<EmailDetail, "id" | "from" | "authenticationResults">,
) => {
  const { senders } = useImageSenders();
  const { data: contacts } = useContacts();
  const loadNow = useSyncExternalStore(subscribe, () => loaded.has(email.id));
  const sender = email.from?.[0]?.email ?? "";
  const trusted = sender !== "" && trusts(senders, sender, Boolean(findContact(contacts, sender)));
  const state = imageState(trusted, sender, email.authenticationResults);
  return {
    sender,
    state,
    loadNow,
    allowRemote: loadNow || state === "load",
    load: () => loadRemoteImages(email.id),
  };
};
