/**
 * Prints a mail: the page from lib/print.ts in a hidden frame, inline images loaded first, the
 * browser's print dialog on it. Remote images stay out, as on screen until they are allowed.
 */
import { useClient } from "@/auth/auth";
import { displayBody } from "@/jmap/mail";
import type { EmailDetail } from "@/jmap/types";
import { formatSize, readingDate } from "@/lib/format";
import { sanitizeMailHtml, textToHtml } from "@/lib/html";
import { printDocument } from "@/lib/print";
import { imageUrl, releaseImageUrl } from "@/lib/safe-blob";
import { useMailAccounts } from "./queries";

const loaded = (image: HTMLImageElement) =>
  image.complete
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });

/** Shows the print dialog for `html`; the frame goes when printing is done. */
const printPage = async (html: string, cleanup: () => void) => {
  const frame = document.createElement("iframe");
  // No scripts in the mail; printing is started from here.
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  frame.srcdoc = html;
  const ready = new Promise<void>((resolve) =>
    frame.addEventListener("load", () => resolve(), { once: true }),
  );
  document.body.append(frame);
  await ready;
  const view = frame.contentWindow!;
  await Promise.all([...frame.contentDocument!.images].map(loaded));
  const done = () => {
    frame.remove();
    cleanup();
  };
  // Some browsers return from print() at once and print later: removed only afterwards.
  view.addEventListener("afterprint", () => setTimeout(done, 0), { once: true });
  view.focus();
  view.print();
};

export const usePrintMail = () => {
  const client = useClient();
  const accounts = useMailAccounts();
  return async (accountId: string, email: EmailDetail) => {
    const inline = [...email.attachments, ...email.htmlBody].filter(
      (part) => part.cid && part.blobId,
    );
    const urls = await Promise.all(
      inline.map(async (part) => {
        const blob = await client.download(accountId, part.blobId!, part.name ?? "bild", part.type);
        // Only images, as in the reading pane (safe-blob.ts).
        return [part.cid!.replace(/^<|>$/g, ""), await imageUrl(blob)] as const;
      }),
    );
    const body = displayBody(email);
    const { html } = sanitizeMailHtml(body.kind === "html" ? body.value : textToHtml(body.value), {
      allowRemote: false,
      cidUrls: Object.fromEntries(urls.filter((entry): entry is [string, string] => !!entry[1])),
    });
    const account = accounts.find((candidate) => candidate.id === accountId);
    const page = printDocument({
      subject: email.subject ?? "",
      from: email.from ?? [],
      to: email.to ?? [],
      cc: email.cc ?? [],
      date: readingDate(email.receivedAt),
      mailbox: account && !account.isPersonal ? account.name : undefined,
      body: html,
      attachments: email.attachments
        .filter((part) => !part.cid || part.disposition === "attachment")
        .map((part) => ({ name: part.name ?? "Anhang", size: formatSize(part.size) })),
    });
    await printPage(page, () => {
      for (const [, url] of urls) if (url) releaseImageUrl(url);
    });
  };
};
