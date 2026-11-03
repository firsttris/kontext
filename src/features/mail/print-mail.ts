/**
 * Prints a mail: the page from lib/print.ts in a hidden frame (print-frame.ts), inline images
 * loaded first. Pictures from the internet come along only where the reading pane shows them too
 * (remote-images.ts: a trusted sender, or loaded for this mail); otherwise they stay out.
 */
import { useClient } from "@/auth/auth";
import { printPage } from "@/components/print-frame";
import { displayBody } from "@/jmap/mail";
import type { EmailDetail } from "@/jmap/types";
import { formatSize, readingDate } from "@/lib/format";
import { sanitizeMailHtml, textToHtml } from "@/lib/html";
import { printDocument } from "@/lib/print";
import { imageUrl, releaseImageUrl } from "@/lib/safe-blob";
import { useMailAccounts } from "./queries";

export const usePrintMail = () => {
  const client = useClient();
  const accounts = useMailAccounts();
  return async (accountId: string, email: EmailDetail, remoteImages = false) => {
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
      allowRemote: remoteImages,
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
      remoteImages,
      attachments: email.attachments
        .filter((part) => !part.cid || part.disposition === "attachment")
        .map((part) => ({ name: part.name ?? "Anhang", size: formatSize(part.size) })),
    });
    await printPage(page, () => {
      for (const [, url] of urls) if (url) releaseImageUrl(url);
    });
  };
};
