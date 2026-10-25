/**
 * Password and (with two-factor sign-in) code, asked again before an agent gets access: its
 * connection signs in at Stalwart on its own (server/mcp/routes.ts, server/mcp/oauth.ts).
 */
import { Input, Label } from "@/components/ui/input";
import { m } from "@/paraglide/messages";

export type Credentials = { password: string; code: string };

export const CredentialFields = ({
  value,
  onChange,
  withCode,
}: {
  value: Credentials;
  onChange: (value: Credentials) => void;
  withCode: boolean;
}) => (
  <>
    <Label>
      {m.agents_password()}
      <Input
        type="password"
        value={value.password}
        onChange={(e) => onChange({ ...value, password: e.target.value })}
        autoComplete="current-password"
        required
      />
    </Label>
    {withCode ? (
      <Label>
        {m.login_code()}
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          value={value.code}
          onChange={(e) => onChange({ ...value, code: e.target.value.replace(/\D/g, "") })}
          required
        />
      </Label>
    ) : null}
  </>
);

/** The write right, as a checkbox with what it allows and what it never does. */
export const WriteChoice = ({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <label className="flex items-start gap-2.5 text-[14px]">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
    />
    <span className="flex flex-col gap-0.5">
      {m.agents_write()}
      <span className="text-[12px] text-muted">{m.agents_write_hint()}</span>
    </span>
  </label>
);
