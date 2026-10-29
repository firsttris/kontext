/** The mark „Extern“ beside a sender from outside the company, while the hint is switched on. */
import { Globe } from "lucide-react";
import { useInsideDomains } from "@/features/company/external-hint";
import { isExternal } from "@/lib/external-hint";
import { m } from "@/paraglide/messages";

export const ExternalMark = ({ address }: { address: string | undefined }) => {
  const inside = useInsideDomains();
  if (!inside || !address || !isExternal(address, inside)) return null;
  return (
    <span
      title={m.mail_external_title()}
      className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full bg-warn/10 px-1.5 text-[11px] font-medium text-warn"
    >
      <Globe size={11} strokeWidth={2.25} aria-hidden="true" />
      {m.mail_external()}
    </span>
  );
};
