export interface TokenBucketOptions {
  capacity: number;
  refillPerWindow: number;
  windowMs: number;
  now?: () => number;
}

export interface TokenBucket {
  tryTake(count?: number): boolean;
  availableTokens(): number;
  msUntilNextToken(): number;
}

export function createTokenBucket(options: TokenBucketOptions): TokenBucket {
  const { capacity, refillPerWindow, windowMs } = options;
  const now = options.now ?? Date.now;
  const refillRatePerMs = refillPerWindow / windowMs;
  let tokens = capacity;
  let lastRefill = now();

  function refill(): void {
    const t = now();
    const elapsed = t - lastRefill;
    if (elapsed <= 0) return;
    tokens = Math.min(capacity, tokens + elapsed * refillRatePerMs);
    lastRefill = t;
  }

  return {
    tryTake(count = 1): boolean {
      refill();
      if (tokens >= count) {
        tokens -= count;
        return true;
      }
      return false;
    },
    availableTokens(): number {
      refill();
      return Math.floor(tokens);
    },
    msUntilNextToken(): number {
      refill();
      if (tokens >= 1) return 0;
      return Math.ceil((1 - tokens) / refillRatePerMs);
    },
  };
}
