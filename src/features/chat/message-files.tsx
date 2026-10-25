/**
 * Photos and files of a message: photos as tiles (one large, several in a grid) that open big
 * with arrows between them, other files as rows to download.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Download, FileText, X } from "lucide-react";
import { useState } from "react";
import { type ChatFile, isPhoto } from "@/lib/chat-cards";
import { cn } from "@/lib/cn";
import { formatSize } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { fileUrl, thumbUrl } from "./upload";

const PhotoViewer = ({
  photos,
  start,
  onClose,
}: {
  photos: ChatFile[];
  start: number;
  onClose: () => void;
}) => {
  const [index, setIndex] = useState(start);
  const photo = photos[index]!;
  const step = (by: number) =>
    setIndex((current) => (current + by + photos.length) % photos.length);
  const button =
    "flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20";
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/85" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") step(1);
            if (event.key === "ArrowLeft") step(-1);
          }}
          className="fixed inset-0 z-50 flex flex-col outline-none"
        >
          <div className="flex items-center gap-2 p-3 text-white safe-top">
            <DialogPrimitive.Title className="m-0 flex-1 truncate text-[14px] font-medium">
              {photo.name}
            </DialogPrimitive.Title>
            <a
              href={fileUrl(photo.id)}
              download={photo.name}
              aria-label={m.chat_download()}
              className={button}
            >
              <Download size={18} />
            </a>
            <DialogPrimitive.Close aria-label={m.chat_close()} className={button}>
              <X size={18} />
            </DialogPrimitive.Close>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center gap-3 px-3 pb-6">
            {photos.length > 1 ? (
              <button
                type="button"
                aria-label={m.chat_photo_previous()}
                onClick={() => step(-1)}
                className={button}
              >
                <ChevronLeft size={20} />
              </button>
            ) : null}
            <img
              src={fileUrl(photo.id)}
              alt={photo.name}
              className="max-h-full min-w-0 max-w-full rounded-lg object-contain"
            />
            {photos.length > 1 ? (
              <button
                type="button"
                aria-label={m.chat_photo_next()}
                onClick={() => step(1)}
                className={button}
              >
                <ChevronRight size={20} />
              </button>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export const MessageFiles = ({ files }: { files: ChatFile[] }) => {
  const [open, setOpen] = useState<number | null>(null);
  const photos = files.filter((file) => isPhoto(file.type));
  const others = files.filter((file) => !isPhoto(file.type));
  if (!files.length) return null;
  return (
    <div className="flex max-w-full flex-col gap-1.5">
      {photos.length ? (
        <ul aria-label={m.chat_photos()} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => setOpen(index)}
                aria-label={m.chat_photo_open({ name: photo.name })}
                className="block overflow-hidden rounded-xl border border-border bg-subtle"
              >
                <img
                  src={thumbUrl(photo)}
                  alt=""
                  loading="lazy"
                  className={cn(
                    "block object-cover",
                    photos.length === 1
                      ? "max-h-72 w-auto max-w-[min(100%,360px)]"
                      : "size-[120px] md:size-[150px]",
                  )}
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {others.map((file) => (
        <a
          key={file.id}
          href={fileUrl(file.id)}
          download={file.name}
          className="flex max-w-[360px] items-center gap-3 rounded-xl border border-border bg-bg px-3 py-2 text-fg no-underline hover:bg-hover"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-muted">
            <FileText size={16} aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[14px] font-medium">{file.name}</span>
            <span className="text-[12px] text-muted">{formatSize(file.size)}</span>
          </span>
          <Download size={16} className="text-muted" aria-hidden="true" />
        </a>
      ))}
      {open !== null ? (
        <PhotoViewer photos={photos} start={open} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
};
