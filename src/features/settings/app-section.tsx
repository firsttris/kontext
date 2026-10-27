/** Kontext as an app on this device: install it, let it open mailto: links, which version it is. */
import { Check, Download, Mail } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";
import {
  canHandleMailto,
  handleMailto,
  isApple,
  useInstalled,
  useInstallPrompt,
} from "@/pwa/install";
import { SettingsCard } from "./settings-page";
import { VersionRow } from "./version-row";

export const AppSection = () => {
  const installed = useInstalled();
  const install = useInstallPrompt();
  const [mailtoAsked, setMailtoAsked] = useState(false);

  return (
    <SettingsCard title={m.pwa_title()} description={m.pwa_hint()}>
      {installed ? (
        <p className="m-0 flex items-center gap-2 text-[14px]">
          <Check size={16} className="text-ok" /> {m.pwa_installed()}
        </p>
      ) : install ? (
        <Button variant="primary" className="self-start" onClick={() => void install()}>
          <Download size={15} /> {m.pwa_install()}
        </Button>
      ) : (
        <p className="m-0 text-[13px] text-muted">
          {isApple() ? m.pwa_install_apple() : m.pwa_install_browser()}
        </p>
      )}
      {canHandleMailto() ? (
        <div className="flex flex-col gap-1.5 border-t border-border pt-4">
          <Button
            className="self-start"
            onClick={() => {
              handleMailto();
              setMailtoAsked(true);
            }}
          >
            <Mail size={15} /> {m.pwa_mailto()}
          </Button>
          <span className="text-[12px] text-muted">
            {mailtoAsked ? m.pwa_mailto_done() : m.pwa_mailto_hint()}
          </span>
        </div>
      ) : null}
      <VersionRow />
    </SettingsCard>
  );
};
