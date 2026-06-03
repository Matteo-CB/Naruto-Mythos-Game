import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
const count = vi.fn();
const groupBy = vi.fn();
const updateMany = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    topdeckTournament: {
      findMany: (...a: unknown[]) => findMany(...a),
      count: (...a: unknown[]) => count(...a),
      groupBy: (...a: unknown[]) => groupBy(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
    },
  },
}));

import { buildTournamentWhere, queryTournaments, getFilterFacets, haversineKm, reconcileStaleStatuses } from '@/lib/topdeck/cache';

beforeEach(() => {
  findMany.mockReset();
  count.mockReset();
  groupBy.mockReset();
  updateMany.mockReset();
});

describe('reconcileStaleStatuses', () => {
  it('promotes upcoming-with-past-date to ongoing OR completed depending on age', async () => {
    updateMany
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 7 })
      .mockResolvedValueOnce({ count: 2 });

    const NOW = Date.UTC(2026, 5, 3, 12, 0, 0);
    const r = await reconcileStaleStatuses(NOW);

    expect(r.toOngoing).toBe(3);
    expect(r.toCompleted).toBe(9);
    expect(updateMany).toHaveBeenCalledTimes(3);

    const upcomingRecent = updateMany.mock.calls[0][0] as { where: Record<string, unknown>; data: { status: string } };
    expect(upcomingRecent.where.status).toBe('upcoming');
    expect(upcomingRecent.where.hasDetail).toBe(false);
    expect(upcomingRecent.data.status).toBe('ongoing');

    const upcomingLongPast = updateMany.mock.calls[1][0] as { where: Record<string, unknown>; data: { status: string } };
    expect(upcomingLongPast.where.status).toBe('upcoming');
    expect(upcomingLongPast.data.status).toBe('completed');

    const ongoingLongPast = updateMany.mock.calls[2][0] as { where: Record<string, unknown>; data: { status: string } };
    expect(ongoingLongPast.where.status).toBe('ongoing');
    expect(ongoingLongPast.data.status).toBe('completed');
  });

  it('returns 0 counts when nothing is stale', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const r = await reconcileStaleStatuses(Date.UTC(2026, 0, 1));
    expect(r.toOngoing).toBe(0);
    expect(r.toCompleted).toBe(0);
  });
});

describe('buildTournamentWhere', () => {
  it('maps equality + case-insensitive + range + search filters', () => {
    const where = buildTournamentWhere({
      game: 'Magic: The Gathering',
      format: 'EDH',
      status: 'completed',
      city: 'Paris',
      country: 'France',
      participantsMin: 8,
      dateFrom: new Date(1000),
      dateTo: new Date(2000),
      search: 'cup',
    });
    expect(where.game).toBe('Magic: The Gathering');
    expect(where.format).toBe('EDH');
    expect(where.status).toBe('completed');
    expect(where.city).toEqual({ equals: 'Paris', mode: 'insensitive' });
    expect(where.country).toEqual({ equals: 'France', mode: 'insensitive' });
    expect(where.participants).toEqual({ gte: 8 });
    expect(where.startDate).toEqual({ gte: new Date(1000), lte: new Date(2000) });
    expect(Array.isArray(where.OR)).toBe(true);
    expect(where.OR).toHaveLength(3);
  });

  it('is empty when no filters provided', () => {
    expect(buildTournamentWhere({})).toEqual({});
  });
});

describe('queryTournaments', () => {
  it('clamps take to [1,200], applies sort/order, returns total + rows', async () => {
    count.mockResolvedValue(7);
    findMany.mockResolvedValue([{ tid: 'a' }, { tid: 'b' }]);
    const res = await queryTournaments({ take: 9999, sort: 'participants', order: 'asc' });
    expect(res.total).toBe(7);
    expect(res.rows).toHaveLength(2);
    expect(res.take).toBe(200);
    const arg = findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual({ participants: 'asc' });
    expect(arg.take).toBe(200);
  });

  it('list reads hit only the database (no upstream client involved)', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);
    for (let i = 0; i < 50; i++) await queryTournaments({});
    expect(findMany).toHaveBeenCalledTimes(50);
    expect(count).toHaveBeenCalledTimes(50);
  });
});

describe('haversineKm', () => {
  it('returns 0 for the same point and a sane distance between cities', () => {
    expect(haversineKm(48.85, 2.35, 48.85, 2.35)).toBe(0);
    const parisLondon = haversineKm(48.8566, 2.3522, 51.5074, -0.1278);
    expect(parisLondon).toBeGreaterThan(330);
    expect(parisLondon).toBeLessThan(360);
  });
});

describe('queryTournaments proximity sort (near)', () => {
  it('sorts by distance to the user, then date, with no-coordinate rows last', async () => {
    const rows = [
      { tid: 'far', location: { lat: 51.5, lng: -0.12 }, startDate: new Date(3000) },
      { tid: 'near', location: { lat: 48.86, lng: 2.35 }, startDate: new Date(5000) },
      { tid: 'nocoord', location: {}, startDate: new Date(1000) },
      { tid: 'mid', location: { lat: 50.85, lng: 4.35 }, startDate: new Date(2000) },
    ];
    findMany.mockResolvedValue(rows);
    const res = await queryTournaments({ status: 'upcoming', near: { lat: 48.8566, lng: 2.3522 }, take: 10 });
    expect(res.rows.map((r) => r.tid)).toEqual(['near', 'mid', 'far', 'nocoord']);
    expect(res.total).toBe(4);
    expect(findMany.mock.calls[0][0].orderBy).toBeUndefined();
  });

  it('respects proximityOrder: date-then-distance vs distance-then-date', async () => {
    const me = { lat: 48.8566, lng: 2.3522 };
    const rows = [
      { tid: 'A', location: { lat: 48.86, lng: 2.35 }, startDate: new Date(1000) },
      { tid: 'B', location: { lat: 51.5, lng: -0.12 }, startDate: new Date(2000) },
      { tid: 'C', location: { lat: 51.5, lng: -0.12 }, startDate: new Date(1000) },
      { tid: 'D', location: { lat: 48.86, lng: 2.35 }, startDate: new Date(2000) },
    ];
    findMany.mockResolvedValue(rows);

    const byDate = await queryTournaments({ near: me, proximityOrder: 'date', order: 'asc', take: 10 });
    expect(byDate.rows.map((r) => r.tid)).toEqual(['A', 'C', 'D', 'B']);

    const byDist = await queryTournaments({ near: me, proximityOrder: 'distance', order: 'asc', take: 10 });
    expect(byDist.rows.map((r) => r.tid)).toEqual(['A', 'D', 'C', 'B']);

    const byDateDesc = await queryTournaments({ near: me, proximityOrder: 'date', order: 'desc', take: 10 });
    expect(byDateDesc.rows.map((r) => r.tid)).toEqual(['D', 'B', 'A', 'C']);
  });

  it('filters to events within maxDistanceKm and drops rows without coordinates', async () => {
    const rows = [
      { tid: 'far', location: { lat: 51.5, lng: -0.12 }, startDate: new Date(3000) },
      { tid: 'near', location: { lat: 48.86, lng: 2.35 }, startDate: new Date(5000) },
      { tid: 'nocoord', location: {}, startDate: new Date(1000) },
      { tid: 'mid', location: { lat: 50.85, lng: 4.35 }, startDate: new Date(2000) },
    ];
    findMany.mockResolvedValue(rows);
    const me = { lat: 48.8566, lng: 2.3522 };
    const r25 = await queryTournaments({ near: me, maxDistanceKm: 25, take: 10 });
    expect(r25.rows.map((x) => x.tid)).toEqual(['near']);
    const r300 = await queryTournaments({ near: me, maxDistanceKm: 300, take: 10 });
    expect(r300.rows.map((x) => x.tid)).toEqual(['near', 'mid']);
  });
});

describe('getFilterFacets', () => {
  it('aggregates and sorts facets by count, dropping empty values', async () => {
    groupBy.mockImplementation(({ by }: { by: string[] }) => {
      const key = by[0];
      const data: Record<string, unknown[]> = {
        game: [{ game: 'Magic: The Gathering', _count: { _all: 100 } }, { game: 'Pokemon', _count: { _all: 5 } }],
        format: [{ format: 'EDH', _count: { _all: 80 } }],
        status: [{ status: 'completed', _count: { _all: 90 } }],
        country: [{ country: 'France', _count: { _all: 10 } }, { country: null, _count: { _all: 3 } }],
        city: [{ city: 'Paris', _count: { _all: 4 } }, { city: '', _count: { _all: 2 } }],
        state: [{ state: 'AURA', _count: { _all: 2 } }],
      };
      return Promise.resolve(data[key]);
    });
    const facets = await getFilterFacets();
    expect(facets.games[0]).toEqual({ value: 'Magic: The Gathering', count: 100 });
    expect(facets.games).toHaveLength(2);
    expect(facets.countries).toEqual([{ value: 'France', count: 10 }]);
    expect(facets.cities).toEqual([{ value: 'Paris', count: 4 }]);
    expect(facets.formats[0].value).toBe('EDH');
  });
});
