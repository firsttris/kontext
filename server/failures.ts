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
  failed: (key: string) => void;
  /** A right password clears the count of its key. */
  cleared: (key: string) => void;
};

export const createFailureLimit = (
  max: number,
  windowMs: number,
  now: () => number = Date.now,
): FailureLimit => {
  const failures = new Map<string, number[]>();
  const recent = (key: string) => {
    const at = now();
    const kept = (failures.get(key) ?? []).filter((time) => at - time < windowMs);
    if (kept.length) failures.set(key, kept);
    else failures.delete(key);
    return kept;
  };
  return {
    blocked: (key) => recent(key).length >= max,
    failed: (key) => failures.set(key, [...recent(key), now()]),
    cleared: (key) => void failures.delete(key),
  };
};

/** Ten wrong passwords per login name within a quarter of an hour, then a pause. */
export const createLoginFailures = (now?: () => number) => createFailureLimit(10, 15 * 60_000, now);
