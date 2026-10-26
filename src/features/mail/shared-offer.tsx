/**
 * What another app shared, shown before it goes into a mail. Any page can send a form to the share
 * target, with its referrer withheld, so nothing shared fills the composer until the person says so.
 */
import { FileText, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

export type SharedContent = { subject?: string; body?: string; files?: File[] };

type Props = { shared: SharedContent; onTake: () => void; onDiscard: () => void };

export const SharedOffer = ({ shared, onTake, onDiscard }: Props) => (
  <section
    aria-label={m.share_offer_title()}
    className="mx-auto flex w-full max-w-lg flex-col gap-4 p-4 md:p-8"
  >
    <div className="flex items-center gap-2 text-[15px] font-semibold">
      <Share2 size={18} aria-hidden="true" /> {m.share_offer_title()}
    </div>
    <p className="m-0 text-[13px] text-muted">{m.share_offer_hint()}</p>
    <div className="flex flex-col gap-2 rounded-xl border border-border p-3 text-[13px]">
      {shared.subject ? <span className="font-medium">{shared.subject}</span> : null}
      {shared.body ? (
        <span className="line-clamp-6 whitespace-pre-wrap break-words">{shared.body}</span>
      ) : null}
      {shared.files?.map((file) => (
        <span key={file.name} className="flex items-center gap-1.5 text-muted">
          <FileText size={14} aria-hidden="true" /> {file.name}
        </span>
      ))}
    </div>
    <div className="flex gap-2">
      <Button variant="primary" onClick={onTake}>
        {m.share_offer_take()}
      </Button>
      <Button onClick={onDiscard}>{m.share_offer_discard()}</Button>
    </div>
  </section>
);
