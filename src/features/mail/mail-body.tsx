/**
 * Shows a mail body in a sandboxed iframe: no scripts, its own styles, height fitted to the
 * content. Inline images (cid:) are loaded as blobs, remote images only on request – or at once
 * for a sender one trusts (image-senders.tsx), when the sender check confirms them.
 */
import { Ellipsis } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useClient } from "@/auth/auth";
import { useTheme } from "@/components/theme/use-theme";
import { displayBody } from "@/jmap/mail";
import type { EmailDetail } from "@/jmap/types";
import { splitQuote, splitTextQuote } from "@/lib/conversation";
import { findContact } from "@/lib/correspondent";
import { mailDocument, sanitizeMailHtml, textToHtml } from "@/lib/html";
import { imageState } from "@/lib/remote-images";
import { imageUrl, releaseImageUrl } from "@/lib/safe-blob";
import { m } from "@/paraglide/messages";
import { trusts } from "../../../server/images/senders";
import { useContacts } from "../contacts/queries";
import { ImagesLine, useImageSenders } from "./image-senders";

/** Object URLs for the inline images of a mail, keyed by Content-ID. */
const useInlineImages = (accountId: string, email: EmailDetail): Record<string, string> => {
  const client = useClient();
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const inline = [...email.attachments, ...email.htmlBody].filter(
      (part) => part.cid && part.blobId,
    );
    if (inline.length === 0) return;
    let cancelled = false;
    const created: string[] = [];
    void Promise.all(
      inline.map(async (part) => {
        const blob = await client.download(accountId, part.blobId!, part.name ?? "bild", part.type);
        // Only images get a URL, and none a tab could run as a page (safe-blob.ts).
        const url = await imageUrl(blob);
        if (url) created.push(url);
        return [part.cid!.replace(/^<|>$/g, ""), url] as const;
      }),
    ).then((entries) => {
      if (cancelled) for (const url of created) releaseImageUrl(url);
      else
        setUrls(
          Object.fromEntries(
            entries.filter((entry): entry is readonly [string, string] => entry[1] !== null),
          ),
        );
    });
    return () => {
      cancelled = true;
      for (const url of created) releaseImageUrl(url);
    };
  }, [client, accountId, email]);
  return urls;
};

export const MailBody = ({ accountId, email }: { accountId: string; email: EmailDetail }) => {
  const dark = useTheme().theme === "dark";
  const [loadNow, setLoadNow] = useState(false);
  const { senders } = useImageSenders();
  const { data: contacts } = useContacts();
  const sender = email.from?.[0]?.email ?? "";
  const trusted = sender !== "" && trusts(senders, sender, Boolean(findContact(contacts, sender)));
  const state = imageState(trusted, sender, email.authenticationResults);
  const allowRemote = loadNow || state === "load";
  const cidUrls = useInlineImages(accountId, email);
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  // The quoted original below a reply is folded; the earlier mails stand above (conversation.tsx).
  const [showQuote, setShowQuote] = useState(false);
  const hasRemote = useMemo(
    () => /<img[^>]+src\s*=\s*["']?https?:/i.test(displayBody(email).value),
    [email],
  );
  const { html, blockedImages, folded } = useMemo(() => {
    const body = displayBody(email);
    const parts =
      body.kind === "html"
        ? splitQuote(body.value)
        : (({ main, quote }) => ({
            main: textToHtml(main),
            quote: quote === null ? null : textToHtml(quote),
          }))(splitTextQuote(body.value));
    const source = parts.quote && !showQuote ? parts.main : parts.main + (parts.quote ?? "");
    return {
      ...sanitizeMailHtml(source, { allowRemote, cidUrls, dark }),
      folded: parts.quote !== null,
    };
  }, [email, allowRemote, cidUrls, showQuote, dark]);

  const document = useMemo(() => mailDocument(html, dark, allowRemote), [html, dark, allowRemote]);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let observer: ResizeObserver | undefined;
    const fit = () => {
      const body = element.contentDocument?.body;
      if (!body) return;
      setHeight(body.scrollHeight + 8);
      observer?.disconnect();
      // Measured in the next frame, so setting the height does not loop within one frame.
      observer = new ResizeObserver(() =>
        requestAnimationFrame(() => setHeight(body.scrollHeight + 8)),
      );
      observer.observe(body);
    };
    element.addEventListener("load", fit);
    return () => {
      element.removeEventListener("load", fit);
      observer?.disconnect();
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {blockedImages > 0 && !allowRemote ? (
        <ImagesLine
          state={state === "unconfirmed" ? "unconfirmed" : "blocked"}
          sender={sender}
          onLoad={() => setLoadNow(true)}
        />
      ) : state === "load" && !loadNow && hasRemote ? (
        <ImagesLine state="trusted" sender={sender} onLoad={() => undefined} />
      ) : null}
      <iframe
        ref={frame}
        title={m.mail_body_title()}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={document}
        className="w-full border-0 bg-transparent"
        style={{ height }}
      />
      {folded ? (
        <button
          type="button"
          aria-expanded={showQuote}
          onClick={() => setShowQuote(!showQuote)}
          className="flex items-center gap-1.5 self-start rounded-lg border border-border px-2.5 py-1 text-[12px] text-muted hover:bg-hover hover:text-fg"
        >
          <Ellipsis size={14} aria-hidden="true" />
          {showQuote ? m.mail_quote_hide() : m.mail_quote_show()}
        </button>
      ) : null}
    </div>
  );
};
