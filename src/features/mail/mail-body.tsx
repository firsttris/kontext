/**
 * Shows a mail body in a sandboxed iframe: no scripts, its own styles, height fitted to the
 * content. Inline images (cid:) are loaded as blobs, remote images only on request.
 */
import { Ellipsis, ImageOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useClient } from "@/auth/auth";
import { useTheme } from "@/components/theme/use-theme";
import { displayBody } from "@/jmap/mail";
import type { EmailDetail } from "@/jmap/types";
import { splitQuote, splitTextQuote } from "@/lib/conversation";
import { mailDocument, sanitizeMailHtml, textToHtml } from "@/lib/html";
import { m } from "@/paraglide/messages";

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
        const url = URL.createObjectURL(blob);
        created.push(url);
        return [part.cid!.replace(/^<|>$/g, ""), url] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setUrls(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [client, accountId, email]);
  return urls;
};

export const MailBody = ({ accountId, email }: { accountId: string; email: EmailDetail }) => {
  const dark = useTheme().theme === "dark";
  const [allowRemote, setAllowRemote] = useState(false);
  const cidUrls = useInlineImages(accountId, email);
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  // The quoted original below a reply is folded; the earlier mails stand above (conversation.tsx).
  const [showQuote, setShowQuote] = useState(false);
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
      ...sanitizeMailHtml(source, { allowRemote, cidUrls }),
      folded: parts.quote !== null,
    };
  }, [email, allowRemote, cidUrls, showQuote]);

  const document = useMemo(() => mailDocument(html, dark), [html, dark]);

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
        <button
          type="button"
          onClick={() => setAllowRemote(true)}
          className="flex items-center gap-2 self-start rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted hover:bg-hover hover:text-fg"
        >
          <ImageOff size={14} /> {m.mail_remote_blocked()}
        </button>
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
