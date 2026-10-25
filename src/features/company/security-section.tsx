/**
 * The Firmenverwaltung's check of how safe mail travels: per domain what is published in DNS, and
 * Kontext over https – each with what it means and what to do (docs/encryption.md, building
 * block 1). The disk cannot be seen from here; the guide says how.
 */
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, CircleDashed, Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import type { Check, CheckState } from "../../../server/company/security";
import { getSecurity } from "./api";

const LABELS: Record<string, () => string> = {
  https: m.security_https,
  mx: m.security_mx,
  spf: m.security_spf,
  dmarc: m.security_dmarc,
  mtaSts: m.security_mta_sts,
  tlsRpt: m.security_tls_rpt,
  dane: m.security_dane,
};

const HINTS: Record<string, Partial<Record<CheckState, () => string>>> = {
  https: { warn: m.security_https_warn },
  mx: { missing: m.security_mx_missing },
  spf: { missing: m.security_spf_missing },
  dmarc: { missing: m.security_dmarc_missing, warn: m.security_dmarc_warn },
  mtaSts: { missing: m.security_mta_sts_missing, warn: m.security_mta_sts_warn },
  tlsRpt: { missing: m.security_tls_rpt_missing },
  dane: { warn: m.security_dane_warn, info: m.security_dane_info },
};

const ICONS: Record<CheckState, typeof CircleCheck> = {
  ok: CircleCheck,
  warn: CircleAlert,
  missing: CircleDashed,
  info: Info,
};

const STATE_LABEL: Record<CheckState, () => string> = {
  ok: m.security_state_ok,
  warn: m.security_state_warn,
  missing: m.security_state_missing,
  info: m.security_state_info,
};

const CheckRow = ({ check }: { check: Check }) => {
  const Icon = ICONS[check.state];
  const hint = HINTS[check.id]?.[check.state];
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Icon
        size={17}
        aria-label={STATE_LABEL[check.state]()}
        className={cn(
          "mt-0.5 shrink-0",
          check.state === "ok"
            ? "text-ok"
            : check.state === "warn"
              ? "text-warn"
              : check.state === "missing"
                ? "text-danger"
                : "text-muted",
        )}
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[14px] font-medium">{LABELS[check.id]?.() ?? check.id}</span>
        {check.detail ? (
          <span className="truncate font-mono text-[12px] text-muted">{check.detail}</span>
        ) : null}
        {hint ? <span className="text-[13px] text-muted">{hint()}</span> : null}
      </span>
    </li>
  );
};

export const SecuritySection = () => {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["company", "security"],
    queryFn: getSecurity,
    staleTime: 60_000,
  });
  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      <div className="flex items-start gap-3">
        <p className="m-0 flex-1 text-[13px] text-muted">{m.security_hint()}</p>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
          <RefreshCw size={14} className={isFetching ? "animate-spin" : undefined} />
          {m.security_recheck()}
        </Button>
      </div>
      {data?.https ? (
        <ul aria-label="Kontext" className="m-0 list-none divide-y divide-border p-0">
          <CheckRow check={data.https} />
        </ul>
      ) : null}
      {data?.domains.map(({ domain, checks }) => (
        <section key={domain} aria-label={domain} className="flex flex-col">
          <h3 className="m-0 border-b border-border pb-2 text-[14px] font-semibold">{domain}</h3>
          <ul className="m-0 list-none divide-y divide-border p-0">
            {checks.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </ul>
        </section>
      ))}
      <p className="m-0 rounded-lg border border-border px-3 py-2.5 text-[13px] text-muted">
        {m.security_disk()}{" "}
        <a href="https://firsttris.github.io/kontext/encryption/" target="_blank" rel="noreferrer">
          {m.security_guide()}
        </a>
      </p>
    </div>
  );
};
