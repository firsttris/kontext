/**
 * "An externe Empfänger senden?" before a mail or an invitation goes outside the company, naming
 * those recipients. Asked once per send: going on sends, going back leaves the form as it was.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useInsideDomains } from "@/features/company/external-hint";
import { externalAddresses } from "@/lib/external-hint";
import { m } from "@/paraglide/messages";

type Asked = { addresses: string[]; proceed: () => void };

export const useExternalQuestion = (kind: "mail" | "invitation") => {
  const inside = useInsideDomains();
  const [asked, setAsked] = useState<Asked | null>(null);
  return {
    /** The addresses outside the company; none while the hint is off. */
    outside: (addresses: readonly string[]) => (inside ? externalAddresses(addresses, inside) : []),
    /** The inside domains while the hint is on (null while off), for checks of one's own. */
    inside,
    ask: (addresses: string[], proceed: () => void) => setAsked({ addresses, proceed }),
    dialog: (
      <Dialog
        open={asked !== null}
        onOpenChange={(open) => (open ? undefined : setAsked(null))}
        title={m.mail_external_ask()}
        description={
          kind === "mail" ? m.mail_external_ask_hint() : m.mail_external_ask_invitation()
        }
      >
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px]">
          {asked?.addresses.map((address) => (
            <li key={address} className="truncate font-medium">
              {address}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          {/* Enter right away goes back: sending outside should be a choice. */}
          <Button variant="ghost" autoFocus onClick={() => setAsked(null)}>
            {m.mail_external_back()}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const proceed = asked?.proceed;
              setAsked(null);
              proceed?.();
            }}
          >
            {m.mail_external_send()}
          </Button>
        </div>
      </Dialog>
    ),
  };
};
