/**
 * How safe mail of the company's domains travels: what is published in DNS (SPF, DMARC, MTA-STS
 * with its policy, TLS-RPT, DANE with DNSSEC) and whether Kontext is reached over https. Looked up
 * over DNS-over-HTTPS, which also says whether an answer is signed (DNSSEC); the evaluation is
 * pure. See docs/encryption.md, building block 1.
 */
export type CheckState = "ok" | "warn" | "missing" | "info";
export type Check = { id: string; state: CheckState; detail: string };
export type DomainChecks = { domain: string; checks: Check[] };

/** A DNS answer: the records' data, and whether the answer was signed (DNSSEC). */
export type Answer = { data: string[]; secure: boolean };
export type Resolve = (name: string, type: "TXT" | "MX" | "TLSA") => Promise<Answer>;

const unquote = (value: string) => value.replace(/^"|"$/g, "").replace(/"\s+"/g, "");

/** Over DNS-over-HTTPS (JSON API); Cloudflare's unless another is given. */
export const dohResolver =
  (base = "https://cloudflare-dns.com/dns-query"): Resolve =>
  async (name, type) => {
    const url = `${base}?name=${encodeURIComponent(name)}&type=${type}&do=1`;
    const response = await fetch(url, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`DNS ${response.status}`);
    const body = (await response.json()) as {
      AD?: boolean;
      Answer?: { type: number; data: string }[];
    };
    const wanted = { TXT: 16, MX: 15, TLSA: 52 }[type];
    return {
      data: (body.Answer ?? []).filter((a) => a.type === wanted).map((a) => unquote(a.data)),
      secure: Boolean(body.AD),
    };
  };

const txt = (answer: Answer, prefix: string) =>
  answer.data.find((value) => value.toLowerCase().startsWith(prefix.toLowerCase()));

/** "mode: enforce" from an MTA-STS policy file, or nothing. */
export const policyMode = (policy: string | null): string | null =>
  policy?.match(/^\s*mode\s*:\s*(\w+)/im)?.[1]?.toLowerCase() ?? null;

export const checkDomain = async (
  domain: string,
  resolve: Resolve,
  fetchPolicy: (url: string) => Promise<string | null>,
): Promise<DomainChecks> => {
  const safe = (name: string, type: "TXT" | "MX" | "TLSA") =>
    resolve(name, type).catch((): Answer => ({ data: [], secure: false }));
  const [mx, root, dmarc, sts, rpt] = await Promise.all([
    safe(domain, "MX"),
    safe(domain, "TXT"),
    safe(`_dmarc.${domain}`, "TXT"),
    safe(`_mta-sts.${domain}`, "TXT"),
    safe(`_smtp._tls.${domain}`, "TXT"),
  ]);
  const host = mx.data[0]?.split(/\s+/)[1]?.replace(/\.$/, "");
  const tlsa = host ? await safe(`_25._tcp.${host}`, "TLSA") : { data: [], secure: false };
  const spf = txt(root, "v=spf1");
  const dmarcRecord = txt(dmarc, "v=DMARC1");
  const dmarcPolicy = dmarcRecord?.match(/\bp\s*=\s*(\w+)/i)?.[1]?.toLowerCase();
  const mode = txt(sts, "v=STSv1")
    ? policyMode(
        await fetchPolicy(`https://mta-sts.${domain}/.well-known/mta-sts.txt`).catch(() => null),
      )
    : null;

  const checks: Check[] = [
    { id: "mx", state: host ? "ok" : "missing", detail: host ?? "" },
    { id: "spf", state: spf ? "ok" : "missing", detail: spf ?? "" },
    {
      id: "dmarc",
      state: !dmarcRecord ? "missing" : dmarcPolicy === "none" ? "warn" : "ok",
      detail: dmarcRecord ?? "",
    },
    {
      id: "mtaSts",
      state: mode === "enforce" ? "ok" : mode === "testing" ? "warn" : "missing",
      detail: mode ?? "",
    },
    { id: "tlsRpt", state: txt(rpt, "v=TLSRPTv1") ? "ok" : "missing", detail: "" },
    {
      id: "dane",
      state: tlsa.data.length && tlsa.secure ? "ok" : mx.secure ? "warn" : "info",
      detail: tlsa.data.length ? `${tlsa.data.length} TLSA` : "",
    },
  ];
  return { domain, checks };
};

/** Kontext itself: reached over https. */
export const httpsCheck = (publicUrl: string): Check => ({
  id: "https",
  state: publicUrl.startsWith("https://") ? "ok" : "warn",
  detail: publicUrl,
});
