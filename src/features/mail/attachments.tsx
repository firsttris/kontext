/**
 * The attachments of a mail as cards: a thumbnail on top (images, and the first page of a PDF),
 * a coloured tile for everything else, name, type and size below. Clicking the thumbnail of a
 * photo or a PDF opens it in a new tab; anything else (also SVG and HTML, which would run with the
 * app's rights as a blob: page) is only downloaded.
 */
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Contact,
  Download,
  File,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Image,
  type LucideIcon,
  Presentation,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useClient } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { SaveToDocuments } from "@/features/documents/document-actions";
import type { BodyPart } from "@/jmap/types";
import {
  type AttachmentKind,
  attachmentKind,
  extensionOf,
  hasThumbnail,
} from "@/lib/attachment-kind";
import { cn } from "@/lib/cn";
import { formatSize } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { renderPdfThumbnail } from "./pdf-thumbnail";

const LOOK: Record<AttachmentKind, { icon: LucideIcon; tone: string }> = {
  pdf: { icon: FileText, tone: "text-red-600 bg-red-500/10 dark:text-red-400" },
  word: { icon: FileText, tone: "text-blue-600 bg-blue-500/10 dark:text-blue-400" },
  sheet: {
    icon: FileSpreadsheet,
    tone: "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400",
  },
  slides: { icon: Presentation, tone: "text-orange-600 bg-orange-500/10 dark:text-orange-400" },
  archive: { icon: FileArchive, tone: "text-amber-600 bg-amber-500/10 dark:text-amber-400" },
  calendar: { icon: CalendarDays, tone: "text-violet-600 bg-violet-500/10 dark:text-violet-400" },
  contact: { icon: Contact, tone: "text-sky-600 bg-sky-500/10 dark:text-sky-400" },
  image: { icon: Image, tone: "text-fuchsia-600 bg-fuchsia-500/10 dark:text-fuchsia-400" },
  text: { icon: FileText, tone: "text-muted bg-subtle" },
  other: { icon: File, tone: "text-muted bg-subtle" },
};

/** Raster images and PDFs the browser shows by itself, without running anything of ours. */
const opensInTab = (part: BodyPart, kind: AttachmentKind) =>
  kind === "pdf" || (kind === "image" && part.type !== "image/svg+xml");

const THUMBNAIL_WIDTH = 432;

/** An object URL for a blob, revoked when the blob changes or the card goes. */
const useObjectUrl = (blob: Blob | undefined): string | undefined => {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
      setUrl(undefined);
    };
  }, [blob]);
  return url;
};

const useAttachment = (accountId: string, part: BodyPart, kind: AttachmentKind) => {
  const client = useClient();
  const preview = Boolean(part.blobId) && hasThumbnail(kind, part.size);
  const file = useQuery({
    queryKey: [accountId, "blob", part.blobId],
    queryFn: () => client.download(accountId, part.blobId!, part.name ?? "anhang", part.type),
    enabled: preview,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const thumbnail = useQuery({
    queryKey: [accountId, "thumbnail", part.blobId],
    queryFn: () =>
      kind === "pdf"
        ? renderPdfThumbnail(file.data!, THUMBNAIL_WIDTH)
        : Promise.resolve(file.data!),
    enabled: Boolean(file.data),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  /** The whole file: from the cache if the thumbnail already fetched it. */
  const fetchFile = () =>
    file.data ?? client.download(accountId, part.blobId!, part.name ?? "anhang", part.type);
  return {
    thumbnailUrl: useObjectUrl(thumbnail.data),
    loading: preview && !thumbnail.isError && !thumbnail.data,
    cached: file.data,
    fetchFile,
  };
};

const save = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

const AttachmentCard = ({ accountId, part }: { accountId: string; part: BodyPart }) => {
  const toast = useToast();
  const kind = attachmentKind(part.type, part.name);
  const { icon: Icon, tone } = LOOK[kind];
  const name = part.name ?? part.type;
  const extension = extensionOf(part.name) || part.type.split("/").pop() || "";
  const { thumbnailUrl, loading, cached, fetchFile } = useAttachment(accountId, part, kind);

  const download = async () => {
    try {
      save(await fetchFile(), part.name ?? "anhang");
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };
  // Opening must happen within the click, or the browser blocks the new tab; so only what the
  // thumbnail already fetched opens, the rest is downloaded.
  const view = () => {
    if (cached && opensInTab(part, kind)) {
      const url = URL.createObjectURL(cached);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else void download();
  };

  return (
    <li className="flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-bg transition-colors hover:border-muted/50 sm:w-[216px]">
      <button
        type="button"
        onClick={view}
        aria-label={m.mail_attachment_view({ name })}
        className="relative block aspect-[4/3] w-full overflow-hidden border-b border-border bg-subtle"
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            className={cn(
              "size-full",
              kind === "pdf" ? "object-cover object-top" : "object-contain",
              kind === "image" && part.type === "image/svg+xml" && "bg-white",
            )}
          />
        ) : (
          <span
            className={cn(
              "flex size-full flex-col items-center justify-center gap-1.5",
              loading && "animate-pulse",
            )}
          >
            <span className={cn("flex size-11 items-center justify-center rounded-xl", tone)}>
              <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="font-mono text-[11px] tracking-wide text-muted uppercase">
              {extension.slice(0, 5)}
            </span>
          </span>
        )}
      </button>
      <div className="flex items-center gap-2 py-2 pr-1.5 pl-2.5">
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", tone)}>
          <Icon size={13} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[13px] font-medium" title={name}>
            {name}
          </span>
          <span className="text-[11px] text-muted uppercase">
            {extension.slice(0, 5)} · <span className="normal-case">{formatSize(part.size)}</span>
          </span>
        </span>
        {part.blobId ? (
          <SaveToDocuments
            accountId={accountId}
            attachment={{ blobId: part.blobId, name, type: part.type }}
          />
        ) : null}
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => void download()}
          aria-label={m.mail_download({ name })}
          title={m.mail_download({ name })}
        >
          <Download size={15} strokeWidth={1.75} />
        </Button>
      </div>
    </li>
  );
};

export const Attachments = ({ accountId, parts }: { accountId: string; parts: BodyPart[] }) =>
  parts.length === 0 ? null : (
    <ul
      aria-label={m.mail_attachments()}
      className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:flex sm:flex-wrap"
    >
      {parts.map((part) => (
        <AttachmentCard key={part.blobId ?? part.partId} accountId={accountId} part={part} />
      ))}
    </ul>
  );
