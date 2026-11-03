/**
 * Shows a mail body in a sandboxed iframe: no scripts, its own styles, fitted to the content
 * (use-fitted-frame.ts). Inline images (cid:) are loaded as blobs, remote images only on request – or at once
 * for a sender one trusts (image-senders.tsx), when the sender check confirms them.
 */
import { Ellipsis } from "lucide-react";
import { useMemo, useState } from "react";
import { useTheme } from "@/components/theme/use-theme";
import { useFittedFrame } from "@/components/use-fitted-frame";
import { displayBody } from "@/jmap/mail";
import type { EmailDetail } from "@/jmap/types";
import { splitQuote, splitTextQuote } from "@/lib/conversation";
import { mailDocument, sanitizeMailHtml, textToHtml } from "@/lib/html";
import { m } from "@/paraglide/messages";
import { ImagesLine } from "./image-senders";
import { useInlineImages } from "./inline-image-urls";
import { useRemoteImages } from "./remote-images";

export const MailBody = ({ accountId, email }: { accountId: string; email: EmailDetail }) => {
  const dark = useTheme().theme === "dark";
  const { sender, state, loadNow, allowRemote, load } = useRemoteImages(email);
  const cidUrls = useInlineImages(accountId, email);
  const [frame, height] = useFittedFrame(120);

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
      ...sanitizeMailHtml(source, { allowRemote, cidUrls, dark, headStyles: true }),
      folded: parts.quote !== null,
    };
  }, [email, allowRemote, cidUrls, showQuote, dark]);

  const document = useMemo(() => mailDocument(html, dark, allowRemote), [html, dark, allowRemote]);

  return (
    <div className="flex flex-col gap-3">
      {blockedImages > 0 && !allowRemote ? (
        <ImagesLine
          state={state === "unconfirmed" ? "unconfirmed" : "blocked"}
          sender={sender}
          onLoad={load}
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
