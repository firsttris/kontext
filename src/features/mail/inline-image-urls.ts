/** The images a mail shows inline (Content-ID), as local URLs: for reading and for a draft opened again. */
import { useEffect, useState } from "react";
import { useClient } from "@/auth/auth";
import type { BodyPart, EmailDetail } from "@/jmap/types";
import { imageUrl, releaseImageUrl } from "@/lib/safe-blob";

/** The parts a mail shows by their Content-ID. */
export const inlineParts = (email: EmailDetail): BodyPart[] =>
  [...email.attachments, ...email.htmlBody].filter((part) => part.cid && part.blobId);

/**
 * Object URLs for the inline images of a mail, keyed by Content-ID; `done` once each was tried
 * (one that fails to load is left out). No mail: nothing, and done.
 */
export const useInlineImageUrls = (
  accountId: string,
  email: EmailDetail | undefined,
): { urls: Record<string, string>; done: boolean } => {
  const client = useClient();
  // Done for the mail it was loaded for: a draft that arrives later is not done yet.
  const [state, setState] = useState<{ email?: EmailDetail; urls: Record<string, string> }>({
    urls: {},
  });
  useEffect(() => {
    const inline = email ? inlineParts(email) : [];
    if (inline.length === 0) {
      setState({ email, urls: {} });
      return;
    }
    let cancelled = false;
    const created: string[] = [];
    void Promise.all(
      inline.map(async (part) => {
        const blob = await client
          .download(accountId, part.blobId!, part.name ?? "bild", part.type)
          .catch(() => null);
        // Only images get a URL, and none a tab could run as a page (safe-blob.ts).
        const url = blob ? await imageUrl(blob) : null;
        if (url) created.push(url);
        return [part.cid!.replace(/^<|>$/g, ""), url] as const;
      }),
    ).then((entries) => {
      if (cancelled) for (const url of created) releaseImageUrl(url);
      else
        setState({
          email,
          urls: Object.fromEntries(
            entries.filter((entry): entry is readonly [string, string] => entry[1] !== null),
          ),
        });
    });
    return () => {
      cancelled = true;
      for (const url of created) releaseImageUrl(url);
    };
  }, [client, accountId, email]);
  return { urls: state.email === email ? state.urls : {}, done: state.email === email };
};

/** Object URLs for the inline images of a mail, keyed by Content-ID. */
export const useInlineImages = (accountId: string, email: EmailDetail): Record<string, string> =>
  useInlineImageUrls(accountId, email).urls;
