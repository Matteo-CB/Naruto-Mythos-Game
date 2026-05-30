import { describe, it, expect, vi, beforeEach } from 'vitest';

const readCursor = vi.fn();
const writeCursor = vi.fn();
const upsertListTournaments = vi.fn();
const getTournamentByTid = vi.fn();
const applyDetail = vi.fn();
const acquireOrRenewLeaderLock = vi.fn();

vi.mock('@/lib/topdeck/cache', () => ({
  readCursor: (...a: unknown[]) => readCursor(...a),
  writeCursor: (...a: unknown[]) => writeCursor(...a),
  upsertListTournaments: (...a: unknown[]) => upsertListTournaments(...a),
  getTournamentByTid: (...a: unknown[]) => getTournamentByTid(...a),
  applyDetail: (...a: unknown[]) => applyDetail(...a),
}));

vi.mock('@/lib/topdeck/leaderLock', () => ({
  acquireOrRenewLeaderLock: (...a: unknown[]) => acquireOrRenewLeaderLock(...a),
}));

import { pollOnce, runPollerTick, searchPair, ensureTournamentDetail } from '@/lib/topdeck/poller';

const NOW = Date.UTC(2026, 4, 29, 12, 0, 0);
const now = () => NOW;

function rawItem(tid: string, daysAgo: number) {
  return {
    TID: tid,
    tournamentName: tid.toUpperCase(),
    startDate: Math.floor((NOW - daysAgo * 86_400_000) / 1000),
    game: 'G',
    format: 'F',
    eventData: { city: 'Paris' },
    standings: [{ name: 'a' }, { name: 'b' }],
  };
}

function makeClient(post: (...a: unknown[]) => unknown, get?: (...a: unknown[]) => unknown) {
  return { post: vi.fn(post), get: vi.fn(get ?? (() => Promise.resolve(null))), bucket: {} as never };
}

beforeEach(() => {
  readCursor.mockReset();
  writeCursor.mockReset();
  upsertListTournaments.mockReset();
  getTournamentByTid.mockReset();
  applyDetail.mockReset();
  acquireOrRenewLeaderLock.mockReset();
  upsertListTournaments.mockImplementation((items: unknown[]) => Promise.resolve(items.length));
  writeCursor.mockResolvedValue(undefined);
});

describe('searchPair', () => {
  it('normalizes, drops placeholder events, and caps at maxItems sorted by recency', async () => {
    const client = makeClient(() =>
      Promise.resolve([
        { TID: 'temp-event', startDate: Math.floor(NOW / 1000) },
        { TID: 'test-tournament-setup', startDate: Math.floor(NOW / 1000) },
        rawItem('old', 10),
        rawItem('new', 1),
        rawItem('mid', 5),
      ]),
    );
    const out = await searchPair(client as never, 'G', 'F', NOW, 2);
    expect(out.map((t) => t.tid)).toEqual(['new', 'mid']);
    const body = (client.post.mock.calls[0] as unknown[])[1] as { game: string; start: number; end: number };
    expect(body.game).toBe('G');
    expect(body.end).toBeGreaterThan(body.start);
  });

  it('returns [] when the API does not return an array', async () => {
    const client = makeClient(() => Promise.resolve({ error: 'nope' }));
    expect(await searchPair(client as never, 'G', 'F', NOW, 10)).toEqual([]);
  });
});

describe('pollOnce', () => {
  it('processes pairsPerTick pairs and advances the round-robin cursor', async () => {
    readCursor.mockResolvedValue(0);
    const client = makeClient(() => Promise.resolve([rawItem('t1', 1), rawItem('t2', 2)]));
    const pairs = [
      { game: 'G', format: 'F1' },
      { game: 'G', format: 'F2' },
      { game: 'H', format: 'F3' },
    ];
    const res = await pollOnce({ client: client as never, pairs, pairsPerTick: 2, now });
    expect(res.skipped).toBe(false);
    expect(client.post).toHaveBeenCalledTimes(2);
    expect(res.pairs).toHaveLength(2);
    expect(res.pairs.every((p) => p.upserted === 2)).toBe(true);
    expect(res.cursorStart).toBe(0);
    expect(res.cursorEnd).toBe(2);
    expect(writeCursor).toHaveBeenCalledWith('round-robin', 2);
  });

  it('wraps the cursor around the end of the pair list', async () => {
    readCursor.mockResolvedValue(2);
    const client = makeClient(() => Promise.resolve([]));
    const pairs = [
      { game: 'G', format: 'F1' },
      { game: 'G', format: 'F2' },
      { game: 'H', format: 'F3' },
    ];
    const res = await pollOnce({ client: client as never, pairs, pairsPerTick: 2, now });
    expect(res.cursorStart).toBe(2);
    expect(res.cursorEnd).toBe(1);
  });

  it('records an error per pair without aborting the tick', async () => {
    readCursor.mockResolvedValue(0);
    const client = makeClient(() => Promise.reject(new Error('RATE_LIMITED')));
    const pairs = [{ game: 'G', format: 'F1' }];
    const res = await pollOnce({ client: client as never, pairs, pairsPerTick: 1, now });
    expect(res.pairs[0].error).toContain('RATE_LIMITED');
    expect(res.pairs[0].upserted).toBe(0);
  });

  it('skips when there are no pairs', async () => {
    const res = await pollOnce({ pairs: [], client: makeClient(() => []) as never });
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('no-pairs');
  });
});

describe('runPollerTick', () => {
  it('does no upstream work when not the leader', async () => {
    acquireOrRenewLeaderLock.mockResolvedValue(false);
    const client = makeClient(() => Promise.resolve([]));
    const res = await runPollerTick('inst-A', { client: client as never, pairs: [{ game: 'G', format: 'F' }] });
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('not-leader');
    expect(client.post).not.toHaveBeenCalled();
  });

  it('polls when it holds the leader lock', async () => {
    acquireOrRenewLeaderLock.mockResolvedValue(true);
    readCursor.mockResolvedValue(0);
    const client = makeClient(() => Promise.resolve([rawItem('t1', 1)]));
    const res = await runPollerTick('inst-A', {
      client: client as never,
      pairs: [{ game: 'G', format: 'F' }],
      pairsPerTick: 1,
      now,
    });
    expect(res.skipped).toBe(false);
    expect(client.post).toHaveBeenCalledTimes(1);
  });
});

describe('ensureTournamentDetail', () => {
  it('serves fresh detail from cache with zero upstream calls', async () => {
    getTournamentByTid.mockResolvedValue({ tid: 't', hasDetail: true, detailFetchedAt: new Date(NOW) });
    const client = makeClient(() => Promise.resolve(null), () => Promise.resolve(null));
    const row = await ensureTournamentDetail('t', { client: client as never, now });
    expect(row).toMatchObject({ tid: 't' });
    expect(client.get).not.toHaveBeenCalled();
  });

  it('fetches /info + /rounds once and dedupes concurrent callers via single-flight', async () => {
    getTournamentByTid.mockResolvedValue({ tid: 't2', hasDetail: false, detailFetchedAt: null, location: {} });
    const get = vi.fn((path: string) => {
      if (String(path).endsWith('/info')) {
        return Promise.resolve({ tid: 't2', status: 'Complete', startDate: Math.floor(NOW / 1000), location: { country: 'France' } });
      }
      return Promise.resolve([{ round: 1, tables: [] }]);
    });
    const client = { post: vi.fn(), get, bucket: {} as never };
    const [a, b] = await Promise.all([
      ensureTournamentDetail('t2', { client: client as never, now }),
      ensureTournamentDetail('t2', { client: client as never, now }),
    ]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(applyDetail).toHaveBeenCalledTimes(1);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
  });

  it('returns null for an unknown tournament', async () => {
    getTournamentByTid.mockResolvedValue(null);
    const client = makeClient(() => Promise.resolve(null));
    expect(await ensureTournamentDetail('missing', { client: client as never, now })).toBeNull();
  });
});
