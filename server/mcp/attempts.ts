/**
 * How often someone may try a password through the agents' routes (making a key, consenting):
 * the same budget as signing in, per person, so a signed-in browser left open is no way to guess
 * the password or the two-factor code. In memory: a restart starts the count again, as Better
 * Auth's own limit on signing in does.
 */
export const createAttempts = (perMinute: number, now: () => number = Date.now) => {
  const tries = new Map<string, number[]>();
  /** Whether one more try is allowed now; a try that is allowed is counted. */
  return (key: string): boolean => {
    const at = now();
    const recent = (tries.get(key) ?? []).filter((time) => at - time < 60_000);
    const allowed = recent.length < perMinute;
    tries.set(key, allowed ? [...recent, at] : recent);
    return allowed;
  };
};
