/**
 * After sending confidentially: the code for each recipient of a link, to pass on another way
 * (phone, SMS). Shown once; a new one can be made under "Vertraulich gesendet".
 */
import { Link } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { m } from "@/paraglide/messages";
import { showCodes, useShownCodes } from "./queries";

export const SecureCodesDialog = () => {
  const codes = useShownCodes();
  const [copied, setCopied] = useState<string | null>(null);
  if (!codes.length) return null;
  const copy = async (code: string) => {
    await navigator.clipboard?.writeText(code).catch(() => undefined);
    setCopied(code);
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && showCodes([])}
      title={m.secure_codes_title()}
      description={m.secure_codes_hint()}
    >
      <ul aria-label={m.secure_codes_title()} className="m-0 flex list-none flex-col gap-2 p-0">
        {codes.map(({ to, code }) => (
          <li
            key={to}
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-[14px]">{to}</span>
            <output
              aria-label={m.secure_code_for({ to })}
              className="font-mono text-[18px] tracking-wider"
            >
              {code}
            </output>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label={m.secure_code_copy({ to })}
              onClick={() => void copy(code)}
            >
              {copied === code ? <Check size={15} /> : <Copy size={15} />}
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <Link to="/secure" onClick={() => showCodes([])} className="text-[13px] text-muted">
          {m.secure_list_link()}
        </Link>
        <Button variant="primary" onClick={() => showCodes([])}>
          {m.secure_codes_done()}
        </Button>
      </div>
    </Dialog>
  );
};
