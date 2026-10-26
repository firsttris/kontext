/**
 * Failed password checks per key (a login name, a client address), so that guessing stops in
 * Kontext before it reaches Stalwart. Stalwart counts every failed login against the address it
 * comes from, and everything from Kontext comes from Kontext's own container: past its
 * `authBanRate` (100 a day by default) it would ban Kontext itself, for everyone
 * (crates/common/src/network/security.rs, `is_auth_fail2banned`, in stalwartlabs/stalwart).
 * In memory: a restart starts the count again, as Better Auth's own limit does.
 */
export type FailureLimit = {
  /** Whether a key has failed too often lately; a blocked check is not sent on. */
  blocked: (key: string) => boolean;
  /**
   * A failed check of `attempt` (a hash of what was tried). The same wrong attempt again counts
   * once: a phone or Thunderbird that keeps trying an old password is no guessing, and must not
   * block a whole office behind one address. Without `attempt` every failure counts.
   */
  failed: (key: string, attempt?: string) => void;
  /** A right password clears the count of its key. */
  cleared: (key: string) => void;
};

export const createFailureLimit = (
  max: number,
  windowMs: number,
  now: () => number = Date.now,
): FailureLimit => {
  const failures = new Map<string, Map<string, number>>();
  const recent = (key: string) => {
    const at = now();
    const kept = new Map([...(failures.get(key) ?? [])].filter(([, time]) => at - time < windowMs));
    if (kept.size) failures.set(key, kept);
    else failures.delete(key);
    return kept;
  };
  return {
    blocked: (key) => recent(key).size >= max,
    failed: (key, attempt = crypto.randomUUID()) =>
      void failures.set(key, recent(key).set(attempt, now())),
    cleared: (key) => void failures.delete(key),
  };
};

/** What a failure is told apart by: a hash of the credentials tried, never the credentials. */
export const attemptOf = async (...parts: (string | undefined)[]): Promise<string> =>
  Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(parts))),
  ).toString("hex");

/**
 * The key a login name counts under. Stalwart takes "jonas" as well as "jonas@firma.de", so both
 * count as one: by the part before the "@" (one company per Stalwart, so names rarely meet).
 */
export const loginKey = (login: string): string =>
  `login:${(login.trim().toLowerCase().split("@")[0] ?? "").trim()}`;

/** Ten wrong passwords per login name within a quarter of an hour, then a pause. */
export const createLoginFailures = (now?: () => number) => createFailureLimit(10, 15 * 60_000, now);
