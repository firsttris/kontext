/**
 * The task boards in other apps: the address and how to set up Thunderbird, Android (DAVx⁵ with
 * tasks.org or jtx Board) and Apple Erinnerungen (server/dav/routes.ts).
 */
import { Check, Copy } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useSession } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";
import { SettingsCard } from "./settings-page";

const Steps = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <h4 className="m-0 text-[14px] font-semibold">{title}</h4>
    <ol className="m-0 flex flex-col gap-1 pl-5 text-[13px] text-muted">{children}</ol>
  </div>
);

export const SyncSection = () => {
  const { data: session } = useSession();
  const address = `${window.location.origin}/dav/`;
  const user = session?.username ?? "";
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(address).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SettingsCard title={m.sync_title()} description={m.sync_hint()}>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-muted">{m.sync_address()}</span>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-subtle px-3 py-2 font-mono text-[13px]">
            {address}
          </code>
          <Button variant="outline" onClick={() => void copy()} aria-label={m.sync_copy()}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? m.sync_copied() : m.sync_copy()}
          </Button>
        </div>
        <span className="text-[12px] text-muted">{m.sync_login({ user })}</span>
      </div>
      <Steps title="Thunderbird">
        <li>{m.sync_thunderbird_1()}</li>
        <li>{m.sync_thunderbird_2()}</li>
        <li>{m.sync_thunderbird_3()}</li>
      </Steps>
      <Steps title="Android">
        <li>{m.sync_android_1()}</li>
        <li>{m.sync_android_2()}</li>
      </Steps>
      <Steps title="iPhone und iPad">
        <li>{m.sync_apple_1()}</li>
        <li>{m.sync_apple_2({ host: window.location.host })}</li>
      </Steps>
      <p className="m-0 border-t border-border pt-3 text-[12px] text-muted">
        {m.sync_two_factor()}
      </p>
    </SettingsCard>
  );
};
