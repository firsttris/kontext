import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { type FormEvent, lazy, Suspense, useState } from "react";
import { type SignInResult, useAuth } from "@/auth/auth";
import { signedOAuthQuery } from "@/auth/oauth-query";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { passkeysSupported } from "@/lib/webauthn";
import { z } from "@/lib/zod";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: ({ context }) => {
    // An OAuth sign-in that asks to sign in again (prompt=login) stays here.
    if (context.client && !signedOAuthQuery(window.location.search)) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

/** The demo signs in by picking a person (src/demo); other builds leave it out (see main.tsx). */
const DemoSignIn =
  import.meta.env.MODE === "demo"
    ? lazy(() => import("@/demo/demo-sign-in").then((module) => ({ default: module.DemoSignIn })))
    : null;

/** What a failed sign-in says; none for a closed passkey dialog. */
const problemOf = (
  result: SignInResult,
  withCode: boolean,
  withPasskey: boolean,
): string | null => {
  if (result === "cancelled") return null;
  if (result === "no-passkeys") return m.login_passkey_unavailable();
  if (result === "failed")
    return withPasskey
      ? m.login_passkey_failed()
      : withCode
        ? m.login_code_failed()
        : m.login_failed();
  return result === "limited" ? m.login_limited() : m.login_offline();
};

function LoginPage() {
  const { login, loginWithPasskey } = useAuth();
  const navigate = useNavigate();
  const { redirect: target } = Route.useSearch();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = async (result: SignInResult, withPasskey: boolean) => {
    // On to Schreibzeug or an agent's consent: the page is leaving, the button stays busy.
    if (result === "continue") return;
    setBusy(false);
    if (result === "ok") {
      await navigate({ to: target?.startsWith("/") ? target : "/" });
    } else if (result === "mfa") {
      setNeedsCode(true);
    } else {
      setError(problemOf(result, needsCode, withPasskey));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    await finish(await login(username.trim(), password, needsCode ? code : undefined), false);
  };

  /** A passkey is a whole sign-in on its own: Stalwart asks no code after it. */
  const withPasskey = async () => {
    setBusy(true);
    setError(null);
    await finish(await loginWithPasskey(), true);
  };

  /** In the demo, to the start: the page before may be someone else's mailbox. */
  const signInAs = async (email: string) => {
    setBusy(true);
    if ((await login(email, "demo")) === "ok") await navigate({ to: "/" });
    setBusy(false);
  };

  return (
    <main className="flex min-h-full items-center justify-center bg-side px-4 py-10">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-border bg-bg p-7 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-[10px] bg-primary text-[16px] font-semibold text-onprimary"
          >
            K
          </span>
          <span className="text-[18px] font-semibold">{m.app_name()}</span>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[22px] font-semibold">
            {DemoSignIn ? m.demo_title() : m.login_title()}
          </h1>
          {DemoSignIn ? null : <p className="m-0 text-[14px] text-muted">{m.login_intro()}</p>}
        </div>
        {DemoSignIn ? (
          <Suspense>
            <DemoSignIn busy={busy} onSignIn={(email) => void signInAs(email)} />
          </Suspense>
        ) : (
          <>
            <Label>
              {m.login_email()}
              <Input
                type="email"
                autoComplete="username"
                required
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Label>
            <Label>
              {m.login_password()}
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Label>
            {needsCode ? (
              <Label>
                {m.login_code()}
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6,8}"
                  required
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
                <span className="text-[12px]">{m.login_code_hint()}</span>
              </Label>
            ) : null}
            {error ? (
              <p role="alert" className="m-0 text-[13px] text-danger">
                {error}
              </p>
            ) : null}
            <Button type="submit" variant="primary" size="lg" disabled={busy}>
              {busy ? m.login_busy() : m.login_submit()}
            </Button>
            {passkeysSupported() && !needsCode ? (
              <>
                <div className="flex items-center gap-3 text-[12px] text-muted" aria-hidden="true">
                  <span className="h-px flex-1 bg-border" />
                  {m.login_or()}
                  <span className="h-px flex-1 bg-border" />
                </div>
                <Button
                  variant="outline"
                  size="lg"
                  disabled={busy}
                  onClick={() => void withPasskey()}
                >
                  <KeyRound size={16} aria-hidden="true" />
                  {m.login_passkey()}
                </Button>
              </>
            ) : null}
          </>
        )}
      </form>
    </main>
  );
}
