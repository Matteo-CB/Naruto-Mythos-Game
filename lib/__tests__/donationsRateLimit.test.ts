import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, resetRateLimit } from '@/lib/donations/rateLimit';

beforeEach(() => resetRateLimit());

describe('rateLimit', () => {
  it('allows up to N requests in the window', () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit('user:abc', 5, 10_000, now + i * 100).allowed).toBe(true);
    }
  });

  it('rejects beyond N requests in the window', () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) rateLimit('user:abc', 5, 10_000, now);
    const r = rateLimit('user:abc', 5, 10_000, now + 50);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it('forgets entries older than the window', () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) rateLimit('user:abc', 5, 10_000, now);
    expect(rateLimit('user:abc', 5, 10_000, now + 11_000).allowed).toBe(true);
  });

  it('isolates keys', () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) rateLimit('user:a', 5, 10_000, now);
    expect(rateLimit('user:a', 5, 10_000, now).allowed).toBe(false);
    expect(rateLimit('user:b', 5, 10_000, now).allowed).toBe(true);
  });
});
