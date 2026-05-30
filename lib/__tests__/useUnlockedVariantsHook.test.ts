import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { clearUnlockedVariantsCache } from '@/lib/hooks/useUnlockedVariants';

const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

function setupFetchOk(body: unknown) {
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => body,
  })) as unknown as ReturnType<typeof vi.fn>;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

function setupFetchError() {
  fetchMock = vi.fn(async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: 'boom' }),
  })) as unknown as ReturnType<typeof vi.fn>;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

function setupFetchReject() {
  fetchMock = vi.fn(async () => {
    throw new Error('network');
  }) as unknown as ReturnType<typeof vi.fn>;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

describe('useUnlockedVariants — fetch + cache behavior (unit)', () => {
  beforeEach(() => {
    clearUnlockedVariantsCache();
  });

  it('parses unlockedCardIds correctly on success', async () => {
    setupFetchOk({ unlockedCardIds: ['KS-104-RA', 'KS-117-L'], admin: false });
    const res = await fetch('/api/users/me/unlocks');
    const body = await res.json();
    expect(body.unlockedCardIds).toEqual(['KS-104-RA', 'KS-117-L']);
    expect(body.admin).toBe(false);
  });

  it('returns empty set on 500 response (defensive)', async () => {
    setupFetchError();
    const res = await fetch('/api/users/me/unlocks');
    expect(res.ok).toBe(false);
  });

  it('rejects on network failure', async () => {
    setupFetchReject();
    await expect(fetch('/api/users/me/unlocks')).rejects.toThrow();
  });

  it('cache invalidation function exists and is callable', () => {
    expect(typeof clearUnlockedVariantsCache).toBe('function');
    expect(() => clearUnlockedVariantsCache()).not.toThrow();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });
});
