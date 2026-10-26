/**
 * A confidential message's content as shown after opening – on the recipient's page and to its
 * sender: the text (cleaned like any mail, no pictures from the internet), attachments to save,
 * and the answers below.
 */
import { Download, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/theme/use-theme";
import { formatSize } from "@/lib/format";
import { mailDocument, sanitizeMailHtml, textToHtml } from "@/lib/html";
import { asDownload } from "@/lib/safe-blob";
import { base64ToBytes, type SecureContent, type SecureFile, type SecureReply } from "@/lib/secure";
import { m } from "@/paraglide/messages";

const when = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "medium",
    timeStyle: "short",
  });

export const SecureFiles = ({ files }: { files: SecureFile[] }) => {
  const urls = useMemo(
    () =>
      files.map((file) =>
        // A download, never a page of Kontext, whatever type the sender gave (safe-blob.ts).
        URL.createObjectURL(asDownload(base64ToBytes(file.data) as Uint8Array<ArrayBuffer>)),
      ),
    [files],
  );
  useEffect(
    () => () => {
      for (const url of urls) URL.revokeObjectURL(url);
    },
    [urls],
  );
  if (!files.length) return null;
  return (
    <ul aria-label={m.mail_attachments()} className="m-0 flex list-none flex-wrap gap-2 p-0">
      {files.map((file, index) => (
        <li key={urls[index]}>
          <a
            href={urls[index]}
            download={file.name}
            className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-fg no-underline hover:bg-hover"
          >
            <FileText size={16} className="text-muted" aria-hidden="true" />
            <span className="flex flex-col">
              <span className="text-[13px] font-medium">{file.name}</span>
              <span className="text-[11px] text-muted">
                {formatSize(Math.floor((file.data.length * 3) / 4))}
              </span>
            </span>
            <Download size={14} className="text-muted" aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
};

const Text = ({ html, text }: { html: string; text: string }) => {
  const dark = useTheme().theme === "dark";
  const [height, setHeight] = useState(140);
  const document = useMemo(
    () =>
      mailDocument(
        sanitizeMailHtml(html || textToHtml(text), { allowRemote: false, cidUrls: {} }).html,
        dark,
      ),
    [html, text, dark],
  );
  return (
    <iframe
      title={m.mail_body_title()}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={document}
      onLoad={(event) =>
        setHeight((event.currentTarget.contentDocument?.body.scrollHeight ?? 132) + 8)
      }
      className="w-full border-0 bg-transparent"
      style={{ height }}
    />
  );
};

export const SecureContentView = ({
  content,
  replies,
  sender,
}: {
  content: SecureContent;
  replies: SecureReply[];
  /** Who sent it, for the answers' heading. */
  sender: string;
}) => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-1">
      <h1 className="m-0 text-[22px] font-semibold tracking-tight">
        {content.subject || m.mail_no_subject()}
      </h1>
      <span className="text-[13px] text-muted">
        {m.secure_from({ sender, when: when(content.sentAt) })}
      </span>
    </div>
    <Text html={content.html} text={content.text} />
    <SecureFiles files={content.attachments} />
    {replies.length ? (
      <section
        aria-label={m.secure_replies()}
        className="flex flex-col gap-3 border-t border-border pt-4"
      >
        <h2 className="m-0 text-[15px] font-semibold">{m.secure_replies()}</h2>
        {replies.map((reply) => (
          <article
            key={reply.at}
            className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2.5"
          >
            <span className="text-[12px] text-muted">{when(reply.at)}</span>
            <p className="m-0 text-[14px] whitespace-pre-wrap">{reply.text}</p>
            <SecureFiles files={reply.attachments} />
          </article>
        ))}
      </section>
    ) : null}
  </div>
);
