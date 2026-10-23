import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: ({ context }) => {
    if (context.client) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { redirect: target } = Route.useSearch();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await login(username.trim(), password, needsCode ? code : undefined);
    setBusy(false);
    if (result === "ok") {
      await navigate({ to: target?.startsWith("/") ? target : "/" });
    } else if (result === "mfa") {
      setNeedsCode(true);
    } else {
      setError(
        result === "failed"
          ? needsCode
            ? m.login_code_failed()
            : m.login_failed()
          : m.login_offline(),
      );
    }
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
            className="flex size-9 items-center justify-center rounded-[10px] bg-primary text-[15px] font-semibold text-onprimary"
          >
            S
          </span>
          <span className="text-[17px] font-semibold">{m.app_name()}</span>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[22px] font-semibold tracking-tight">{m.login_title()}</h1>
          <p className="m-0 text-[14px] text-muted">{m.login_intro()}</p>
        </div>
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
      </form>
    </main>
  );
}
