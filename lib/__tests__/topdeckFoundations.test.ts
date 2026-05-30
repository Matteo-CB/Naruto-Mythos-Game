import { describe, it, expect, vi } from 'vitest';
import { createTokenBucket } from '@/lib/topdeck/rateLimiter';
import { createSingleFlight } from '@/lib/topdeck/singleFlight';
import { swrState } from '@/lib/topdeck/swr';
import { createTopdeckClient, parseRetryAfter } from '@/lib/topdeck/client';
import { TOPDECK_GAME_CATALOG, topdeckGameFormatPairs, nextRoundRobinIndex } from '@/lib/topdeck/games';

function fakeRes(status: number, data: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? headers[k.toLowerCase()] ?? null },
    json: async () => data,
  } as unknown as Response;
}

describe('topdeck rate limiter (token bucket)', () => {
  it('caps takes at capacity with no time elapsed, then refills exactly capacity per window', () => {
    let t = 0;
    const bucket = createTokenBucket({ capacity: 5, refillPerWindow: 5, windowMs: 1000, now: () => t });
    let taken = 0;
    for (let i = 0; i < 50; i++) if (bucket.tryTake()) taken++;
    expect(taken).toBe(5);
    t += 1000;
    let taken2 = 0;
    for (let i = 0; i < 50; i++) if (bucket.tryTake()) taken2++;
    expect(taken2).toBe(5);
  });

  it('reports a positive wait when empty', () => {
    let t = 0;
    const bucket = createTokenBucket({ capacity: 1, refillPerWindow: 60, windowMs: 60_000, now: () => t });
    expect(bucket.tryTake()).toBe(true);
    expect(bucket.tryTake()).toBe(false);
    expect(bucket.msUntilNextToken()).toBeGreaterThan(0);
  });
});

describe('topdeck single-flight', () => {
  it('dedupes concurrent identical keys into one underlying call', async () => {
    const sf = createSingleFlight();
    let calls = 0;
    const fn = () => { calls++; return new Promise<number>((r) => setTimeout(() => r(42), 5)); };
    const [a, b] = await Promise.all([sf.run('k', fn), sf.run('k', fn)]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(calls).toBe(1);
    expect(sf.inflightCount()).toBe(0);
  });

  it('runs separately per key and is re-runnable after settle', async () => {
    const sf = createSingleFlight();
    let calls = 0;
    const fn = () => { calls++; return Promise.resolve('x'); };
    await Promise.all([sf.run('a', fn), sf.run('b', fn)]);
    expect(calls).toBe(2);
    await sf.run('a', fn);
    expect(calls).toBe(3);
  });
});

describe('topdeck stale-while-revalidate', () => {
  it('classifies fresh / stale / expired / missing', () => {
    const base = { now: 10_000, freshMs: 1_000, staleMs: 5_000 };
    expect(swrState({ ...base, fetchedAt: 9_500 })).toBe('fresh');
    expect(swrState({ ...base, fetchedAt: 6_000 })).toBe('stale');
    expect(swrState({ ...base, fetchedAt: 1_000 })).toBe('expired');
    expect(swrState({ ...base, fetchedAt: null })).toBe('missing');
  });
});

describe('topdeck game catalog + round-robin', () => {
  it('flattens a catalog into game/format pairs in order', () => {
    const pairs = topdeckGameFormatPairs([
      { game: 'G', formats: ['F1', 'F2'] },
      { game: 'H', formats: ['F3'] },
    ]);
    expect(pairs).toEqual([
      { game: 'G', format: 'F1' },
      { game: 'G', format: 'F2' },
      { game: 'H', format: 'F3' },
    ]);
  });

  it('the default catalog yields at least one non-empty pair per game', () => {
    const pairs = topdeckGameFormatPairs();
    expect(pairs.length).toBeGreaterThanOrEqual(TOPDECK_GAME_CATALOG.length);
    for (const p of pairs) {
      expect(p.game).toBeTruthy();
      expect(p.format).toBeTruthy();
    }
  });

  it('advances the round-robin index and wraps around safely', () => {
    expect(nextRoundRobinIndex(0, 3)).toBe(1);
    expect(nextRoundRobinIndex(2, 3)).toBe(0);
    expect(nextRoundRobinIndex(-5, 3)).toBe(1);
    expect(nextRoundRobinIndex(0, 0)).toBe(0);
  });
});

describe('parseRetryAfter', () => {
  it('parses seconds and http-date forms', () => {
    expect(parseRetryAfter('5')).toBe(5000);
    expect(parseRetryAfter('0')).toBe(0);
    expect(parseRetryAfter(null)).toBe(null);
    const future = parseRetryAfter(new Date(10_000).toUTCString(), 8_000);
    expect(future).not.toBeNull();
    expect(future! >= 0).toBe(true);
  });
});

describe('topdeck client', () => {
  const noSleep = async () => {};

  it('returns parsed json on success with one fetch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeRes(200, { ok: true }));
    const client = createTopdeckClient({ apiKey: 'k', fetchImpl, sleep: noSleep });
    expect(await client.get('/v2/x')).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 (Retry-After) then succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(fakeRes(429, null, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(fakeRes(200, { ok: true }));
    const sleeps: number[] = [];
    const client = createTopdeckClient({ apiKey: 'k', fetchImpl, sleep: async (ms) => { sleeps.push(ms); } });
    expect(await client.get('/v2/x')).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleeps.length).toBe(1);
  });

  it('throws RATE_LIMITED after exceeding max 429 retries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeRes(429, null, { 'Retry-After': '0' }));
    const client = createTopdeckClient({ apiKey: 'k', fetchImpl, sleep: noSleep });
    await expect(client.get('/v2/x')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('throws HTTP_ERROR on 4xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeRes(404, null));
    const client = createTopdeckClient({ apiKey: 'k', fetchImpl, sleep: noSleep });
    await expect(client.get('/v2/x')).rejects.toMatchObject({ code: 'HTTP_ERROR', status: 404 });
  });

  it('retries 5xx then succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(fakeRes(500, null))
      .mockResolvedValueOnce(fakeRes(200, { ok: true }));
    const client = createTopdeckClient({ apiKey: 'k', fetchImpl, sleep: noSleep });
    expect(await client.get('/v2/x')).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws NO_API_KEY when no key is configured', async () => {
    const saved = process.env.TOPDECK_API_KEY;
    delete process.env.TOPDECK_API_KEY;
    try {
      const client = createTopdeckClient({ fetchImpl: vi.fn(), sleep: noSleep });
      await expect(client.get('/v2/x')).rejects.toMatchObject({ code: 'NO_API_KEY' });
    } finally {
      if (saved !== undefined) process.env.TOPDECK_API_KEY = saved;
    }
  });

  it('single-flights concurrent identical GETs into one fetch', async () => {
    let resolveFetch: (v: Response) => void = () => {};
    const pending = new Promise<Response>((r) => { resolveFetch = r; });
    const fetchImpl = vi.fn().mockReturnValue(pending);
    const client = createTopdeckClient({ apiKey: 'k', fetchImpl, sleep: noSleep });
    const p1 = client.get('/v2/x');
    const p2 = client.get('/v2/x');
    resolveFetch(fakeRes(200, { ok: true }));
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
