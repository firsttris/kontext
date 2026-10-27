/**
 * Password and two-factor sign-in (both need the current password, Stalwart checks it), and whose
 * pictures from the internet load at once.
 */

import { useNavigate } from "@tanstack/react-router";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { renderSVG } from "uqr";
import { useAuth, useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { changePassword, disableTwoFactor, enableTwoFactor } from "@/jmap/settings";
import { cn } from "@/lib/cn";
import { newSecret, otpauthUrl, verifyTotp } from "@/lib/totp";
import { m } from "@/paraglide/messages";
import { ImageSendersCard } from "./image-senders-card";
import { useSave, useTwoFactor } from "./queries";
import { SettingsCard } from "./settings-page";

const passwordInput = (
  label: string,
  value: string,
  set: (v: string) => void,
  autoComplete: string,
) => (
  <Label>
    {label}
    <Input
      type="password"
      value={value}
      onChange={(e) => set(e.target.value)}
      required
      autoComplete={autoComplete}
    />
  </Label>
);

const codeInput = (value: string, set: (v: string) => void) => (
  <Label>
    {m.login_code()}
    <Input
      inputMode="numeric"
      autoComplete="one-time-code"
      value={value}
      onChange={(e) => set(e.target.value.replace(/\D/g, ""))}
      required
    />
  </Label>
);

/** Whether sign-in asks for a code, as a panel one sees at a glance: green when on. */
const TwoFactorStatus = ({ on, action }: { on: boolean; action: ReactNode }) => {
  const Icon = on ? ShieldCheck : ShieldOff;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border p-3",
        on ? "border-ok/40 bg-ok/10" : "border-border bg-subtle",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          on ? "bg-ok/15 text-ok" : "bg-bg text-muted",
        )}
      >
        <Icon size={18} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={cn("text-[14px] font-semibold", on && "text-ok")}>
          {on ? m.settings_2fa_active() : m.settings_2fa_inactive()}
        </span>
        <span className="text-[13px] text-muted">
          {on ? m.settings_2fa_on() : m.settings_2fa_off()}
        </span>
      </div>
      {action}
    </div>
  );
};

export const SecuritySection = () => (
  <>
    <PasswordCard />
    <TwoFactorCard />
    <ImageSendersCard />
  </>
);

const PasswordCard = () => {
  const client = useClient();
  const toast = useToast();
  const { login } = useAuth();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { data: twoFactor } = useTwoFactor();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const save = useSave(
    ({ current: old, next: fresh }: { current: string; next: string }) =>
      changePassword(client, old, fresh, twoFactor ? code : undefined),
    [],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    if (next !== repeat) {
      setProblem(m.settings_password_mismatch());
      return;
    }
    try {
      const result = await save.mutateAsync({ current, next });
      if (result === "wrong-password") {
        setProblem(m.settings_password_wrong());
        return;
      }
      // Stalwart ends all sessions on a new password: sign in again with it right away.
      const again = await login(session?.username ?? "", next, twoFactor ? code : undefined);
      setCurrent("");
      setNext("");
      setRepeat("");
      setCode("");
      toast.show(m.settings_password_changed());
      if (again !== "ok")
        await navigate({ to: "/login", search: { redirect: "/settings?section=security" } });
    } catch (error) {
      // Stalwart explains a weak password in its own words.
      setProblem((error as Error).message);
    }
  };

  return (
    <SettingsCard title={m.settings_password()} description={m.settings_password_hint()}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {passwordInput(m.settings_password_current(), current, setCurrent, "current-password")}
        {passwordInput(m.settings_password_new(), next, setNext, "new-password")}
        {passwordInput(m.settings_password_repeat(), repeat, setRepeat, "new-password")}
        {twoFactor ? codeInput(code, setCode) : null}
        {problem ? (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {problem}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="self-start" disabled={save.isPending}>
          {m.settings_password_change()}
        </Button>
      </form>
    </SettingsCard>
  );
};

const TwoFactorCard = () => {
  const client = useClient();
  const toast = useToast();
  const { data: session } = useSession();
  const { data: enabled, isPending } = useTwoFactor();
  const [setup, setSetup] = useState<string | null>(null);
  // Switching off asks for password and code only once one chooses to, not as a standing form.
  const [disabling, setDisabling] = useState(false);
  const [code, setCode] = useState("");
  const [current, setCurrent] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const url = setup ? otpauthUrl(setup, session?.username ?? "") : "";
  const qr = useMemo(() => (url ? renderSVG(url, { border: 1 }) : ""), [url]);

  const save = useSave(
    async ({ action }: { action: "enable" | "disable" }) =>
      action === "enable"
        ? enableTwoFactor(client, current, url, code)
        : disableTwoFactor(client, current, code),
    [["settings", "twoFactor"]],
  );

  const submit = async (event: FormEvent, action: "enable" | "disable") => {
    event.preventDefault();
    setProblem(null);
    if (action === "enable" && !(await verifyTotp(setup!, code))) {
      setProblem(m.login_code_failed());
      return;
    }
    try {
      const result = await save.mutateAsync({ action });
      if (result === "wrong-password") {
        setProblem(m.settings_password_wrong());
        return;
      }
      reset();
      toast.show(action === "enable" ? m.settings_2fa_enabled() : m.settings_2fa_disabled());
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  const reset = () => {
    setSetup(null);
    setDisabling(false);
    setCode("");
    setCurrent("");
    setProblem(null);
  };

  if (isPending) return null;

  return (
    <SettingsCard title={m.settings_2fa()} description={m.settings_2fa_hint()}>
      {enabled && !disabling ? (
        <TwoFactorStatus
          on
          action={<Button onClick={() => setDisabling(true)}>{m.settings_2fa_disable()}</Button>}
        />
      ) : enabled ? (
        <form onSubmit={(e) => void submit(e, "disable")} className="flex flex-col gap-4">
          <TwoFactorStatus on action={null} />
          <p className="m-0 text-[14px]">{m.settings_2fa_disable_confirm()}</p>
          {passwordInput(m.settings_password_current(), current, setCurrent, "current-password")}
          {codeInput(code, setCode)}
          {problem ? (
            <p role="alert" className="m-0 text-[13px] text-danger">
              {problem}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={save.isPending}>
              {m.settings_2fa_disable()}
            </Button>
            <Button variant="ghost" onClick={reset}>
              {m.contacts_cancel()}
            </Button>
          </div>
        </form>
      ) : setup ? (
        <form onSubmit={(e) => void submit(e, "enable")} className="flex flex-col gap-4">
          <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 text-[14px]">
            <li>{m.settings_2fa_step_scan()}</li>
            <li>{m.settings_2fa_step_code()}</li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            <div
              role="img"
              aria-label={m.settings_2fa_qr()}
              className="size-44 rounded-lg bg-white p-1 [&_svg]:size-full"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generated locally by uqr
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <div className="flex min-w-0 flex-col gap-1 text-[13px] text-muted">
              {m.settings_2fa_manual()}
              <code className="font-mono text-[13px] break-all text-fg" data-testid="totp-secret">
                {setup}
              </code>
            </div>
          </div>
          <Label>
            {m.login_code()}
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
            />
          </Label>
          {passwordInput(m.settings_password_current(), current, setCurrent, "current-password")}
          {problem ? (
            <p role="alert" className="m-0 text-[13px] text-danger">
              {problem}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {m.settings_2fa_enable()}
            </Button>
            <Button variant="ghost" onClick={reset}>
              {m.contacts_cancel()}
            </Button>
          </div>
        </form>
      ) : (
        <TwoFactorStatus
          on={false}
          action={
            <Button variant="primary" onClick={() => setSetup(newSecret())}>
              {m.settings_2fa_setup()}
            </Button>
          }
        />
      )}
    </SettingsCard>
  );
};
