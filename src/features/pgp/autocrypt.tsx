/**
 * Autocrypt in the app: one's own key along with every mail sent from the address it belongs to,
 * and the keys others send along taken over – for the address they came from only, and noted
 * when another than the known one arrives (server/pgp/store.ts).
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { EmailDetail } from "@/jmap/types";
import { autocryptHeader, describeKey, readAutocrypt } from "@/lib/pgp";
import { useKnownKeys, useOwnKey, usePgpActions } from "./queries";

/** The Autocrypt header for mails from this address, or null without a key for it. */
export const useAutocryptHeader = (from: string | undefined): string | null => {
  const { data: own } = useOwnKey();
  const mine = Boolean(own && from && own.email === from.toLowerCase());
  return (
    useQuery({
      queryKey: ["pgp", "autocrypt", own?.fingerprint],
      queryFn: () => autocryptHeader(own!.email, own!.publicKey),
      enabled: mine,
      staleTime: Number.POSITIVE_INFINITY,
    }).data ?? null
  );
};

/** Mails already looked at in this tab. */
const seen = new Set<string>();

/** Takes over the key a mail's sender sent along, unless it is known already. */
const useCollectAutocrypt = (email: EmailDetail) => {
  const known = useKnownKeys();
  const { data: own } = useOwnKey();
  const { remember } = usePgpActions();
  useEffect(() => {
    if (!email.autocrypt || seen.has(email.id)) return;
    seen.add(email.id);
    const sender = email.from?.[0]?.email.toLowerCase();
    void (async () => {
      const header = await readAutocrypt(email.autocrypt);
      if (!header || header.addr !== sender || header.addr === own?.email) return;
      const fingerprint = (await describeKey(header.publicKey))?.fingerprint;
      if (known.some((key) => key.email === header.addr && key.fingerprint === fingerprint)) return;
      await remember({ publicKey: header.publicKey, source: "autocrypt", email: header.addr });
    })().catch(() => undefined);
  }, [email, known, own, remember]);
};

/** In the mail view: shows nothing, takes the key over. */
export const AutocryptCollector = ({ email }: { email: EmailDetail }) => {
  useCollectAutocrypt(email);
  return null;
};
