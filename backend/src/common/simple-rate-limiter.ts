// In-memory, per-process sliding-window rate limit for public (no-login)
// routes — same mechanism and caveats as the private SimpleRateLimiter in
// quotations.service.ts / approval-decisions.service.ts (no Redis here, so
// not a distributed limiter across multiple instances). Shared copy for
// new public routes; those two are left as they are.
export class SimpleRateLimiter {
  private hits = new Map<string, number[]>();
  private lastSweep = 0;
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  // Returns true if `key` is currently allowed to proceed (and records this
  // attempt); false if it's been called too many times within the window.
  check(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    // Once per window, drop keys whose hits have all aged out, so one-off
    // visitors don't accumulate in the map for the life of the process.
    if (now - this.lastSweep >= this.windowMs) {
      this.lastSweep = now;
      for (const [k, times] of this.hits) {
        if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(k);
      }
    }
    return true;
  }
}
