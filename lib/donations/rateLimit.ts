const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export function rateLimit(key: string, max: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    const oldest = arr[0];
    return { allowed: false, retryAfterMs: Math.max(0, windowMs - (now - oldest)) };
  }
  arr.push(now);
  buckets.set(key, arr);
  return { allowed: true, retryAfterMs: 0 };
}

export function resetRateLimit(key?: string): void {
  if (key === undefined) {
    buckets.clear();
  } else {
    buckets.delete(key);
  }
}
