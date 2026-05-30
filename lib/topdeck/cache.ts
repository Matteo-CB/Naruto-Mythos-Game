import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { NormalizedTopdeckTournament, NormalizedDetail } from './normalize';
import { syncPlayerResults } from './players';

function locationJson(n: NormalizedTopdeckTournament): Prisma.InputJsonValue {
  return {
    lat: n.lat,
    lng: n.lng,
    headerImage: n.headerImage,
    averageElo: n.averageElo,
    rawStatus: n.rawStatus,
  } as Prisma.InputJsonValue;
}

function listFields(n: NormalizedTopdeckTournament, now: Date) {
  const base = {
    name: n.name,
    game: n.game,
    format: n.format,
    startDate: n.startDate,
    city: n.city,
    state: n.state,
    country: n.country,
    locationName: n.locationName,
    location: locationJson(n),
    participants: n.participants,
    topCut: n.topCut,
    swissNum: n.swissNum,
    fetchedAt: now,
  };
  if (n.standings && n.standings.length) {
    return { ...base, standings: n.standings as unknown as Prisma.InputJsonValue };
  }
  return base;
}

export async function upsertListTournaments(items: NormalizedTopdeckTournament[]): Promise<number> {
  if (!items.length) return 0;
  const tids = items.map((i) => i.tid);
  const existing = await prisma.topdeckTournament.findMany({
    where: { tid: { in: tids } },
    select: { tid: true, hasDetail: true },
  });
  const detailedSet = new Set(existing.filter((e) => e.hasDetail).map((e) => e.tid));
  const existingSet = new Set(existing.map((e) => e.tid));
  const now = new Date();
  let count = 0;
  for (const n of items) {
    const fields = listFields(n, now);
    const update = detailedSet.has(n.tid) ? fields : { ...fields, status: n.status };
    await prisma.topdeckTournament.upsert({
      where: { tid: n.tid },
      create: { tid: n.tid, status: n.status, hasDetail: false, ...fields },
      update,
    });
    if (!existingSet.has(n.tid)) {
      await syncPlayerResults({ tid: n.tid, name: n.name, game: n.game, format: n.format, startDate: n.startDate, standings: n.standings });
    }
    count++;
  }
  return count;
}

export async function applyDetail(
  tid: string,
  detail: NormalizedDetail,
  rounds?: unknown,
): Promise<void> {
  const existing = await prisma.topdeckTournament.findUnique({
    where: { tid },
    select: { location: true },
  });
  const prevLoc = (existing?.location && typeof existing.location === 'object' ? existing.location : {}) as Record<string, unknown>;
  const mergedLoc: Prisma.InputJsonValue = {
    ...prevLoc,
    lat: detail.lat ?? prevLoc.lat ?? null,
    lng: detail.lng ?? prevLoc.lng ?? null,
    headerImage: detail.headerImage ?? prevLoc.headerImage ?? null,
    rawStatus: detail.rawStatus ?? prevLoc.rawStatus ?? null,
  } as Prisma.InputJsonValue;

  await prisma.topdeckTournament.update({
    where: { tid },
    data: {
      status: detail.status,
      endDate: detail.endDate ?? undefined,
      startDate: detail.startDate ?? undefined,
      city: detail.city ?? undefined,
      state: detail.state ?? undefined,
      country: detail.country ?? undefined,
      locationName: detail.locationName ?? undefined,
      location: mergedLoc,
      rounds: rounds !== undefined ? (rounds as Prisma.InputJsonValue) : undefined,
      hasDetail: true,
      detailFetchedAt: new Date(),
    },
  });
}

export interface TournamentQuery {
  game?: string;
  format?: string;
  status?: string;
  city?: string;
  state?: string;
  country?: string;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  participantsMin?: number;
  sort?: 'startDate' | 'participants';
  order?: 'asc' | 'desc';
  near?: { lat: number; lng: number };
  maxDistanceKm?: number;
  proximityOrder?: 'date' | 'distance';
  skip?: number;
  take?: number;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function rowCoords(location: unknown): { lat: number; lng: number } | null {
  const loc = (location && typeof location === 'object' ? location : {}) as Record<string, unknown>;
  const lat = loc.lat, lng = loc.lng;
  if (typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return null;
}

export function buildTournamentWhere(q: TournamentQuery): Prisma.TopdeckTournamentWhereInput {
  const where: Prisma.TopdeckTournamentWhereInput = {};
  if (q.game) where.game = q.game;
  if (q.format) where.format = q.format;
  if (q.status) where.status = q.status;
  if (q.city) where.city = { equals: q.city, mode: 'insensitive' };
  if (q.state) where.state = { equals: q.state, mode: 'insensitive' };
  if (q.country) where.country = { equals: q.country, mode: 'insensitive' };
  if (typeof q.participantsMin === 'number') where.participants = { gte: q.participantsMin };
  if (q.dateFrom || q.dateTo) {
    where.startDate = {};
    if (q.dateFrom) where.startDate.gte = q.dateFrom;
    if (q.dateTo) where.startDate.lte = q.dateTo;
  }
  if (q.search && q.search.trim()) {
    const term = q.search.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { city: { contains: term, mode: 'insensitive' } },
      { locationName: { contains: term, mode: 'insensitive' } },
    ];
  }
  return where;
}

export async function queryTournaments(q: TournamentQuery) {
  const where = buildTournamentWhere(q);
  const take = Math.min(Math.max(q.take ?? 50, 1), 200);
  const skip = Math.max(q.skip ?? 0, 0);

  if (q.near) {
    const { lat, lng } = q.near;
    const all = await prisma.topdeckTournament.findMany({ where });
    let ranked = all.map((r) => {
      const c = rowCoords(r.location);
      return { r, dist: c ? haversineKm(lat, lng, c.lat, c.lng) : null };
    });
    if (typeof q.maxDistanceKm === 'number' && Number.isFinite(q.maxDistanceKm) && q.maxDistanceKm > 0) {
      ranked = ranked.filter((x) => x.dist != null && x.dist <= q.maxDistanceKm!);
    }
    const dateDir = q.order === 'desc' ? -1 : 1;
    const proxOrder = q.proximityOrder ?? 'distance';
    ranked.sort((a, b) => {
      const ta = a.r.startDate?.getTime() ?? 0;
      const tb = b.r.startDate?.getTime() ?? 0;
      if (proxOrder === 'distance') {
        if (a.dist == null && b.dist == null) return (ta - tb) * dateDir;
        if (a.dist == null) return 1;
        if (b.dist == null) return -1;
        if (a.dist !== b.dist) return a.dist - b.dist;
        return (ta - tb) * dateDir;
      }
      if (ta !== tb) return (ta - tb) * dateDir;
      if (a.dist == null && b.dist == null) return 0;
      if (a.dist == null) return 1;
      if (b.dist == null) return -1;
      return a.dist - b.dist;
    });
    return { total: ranked.length, rows: ranked.slice(skip, skip + take).map((x) => x.r), skip, take };
  }

  const sort = q.sort ?? 'startDate';
  const order = q.order ?? 'desc';
  const [total, rows] = await Promise.all([
    prisma.topdeckTournament.count({ where }),
    prisma.topdeckTournament.findMany({
      where,
      orderBy: { [sort]: order },
      skip,
      take,
    }),
  ]);
  return { total, rows, skip, take };
}

export async function getTournamentByTid(tid: string) {
  return prisma.topdeckTournament.findUnique({ where: { tid } });
}

export interface FilterFacets {
  games: { value: string; count: number }[];
  formats: { value: string; count: number }[];
  statuses: { value: string; count: number }[];
  countries: { value: string; count: number }[];
  cities: { value: string; count: number }[];
  states: { value: string; count: number }[];
}

function facetFromGroup<T extends Record<string, unknown>>(
  rows: T[],
  key: keyof T,
): { value: string; count: number }[] {
  return rows
    .map((r) => ({ value: r[key] as unknown as string, count: (r._count as { _all: number })._all }))
    .filter((r) => r.value != null && String(r.value).trim() !== '')
    .sort((a, b) => b.count - a.count);
}

export async function getFilterFacets(base: TournamentQuery = {}): Promise<FilterFacets> {
  const where = buildTournamentWhere(base);
  const [games, formats, statuses, countries, cities, states] = await Promise.all([
    prisma.topdeckTournament.groupBy({ by: ['game'], where, _count: { _all: true } }),
    prisma.topdeckTournament.groupBy({ by: ['format'], where, _count: { _all: true } }),
    prisma.topdeckTournament.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.topdeckTournament.groupBy({ by: ['country'], where, _count: { _all: true } }),
    prisma.topdeckTournament.groupBy({ by: ['city'], where, _count: { _all: true } }),
    prisma.topdeckTournament.groupBy({ by: ['state'], where, _count: { _all: true } }),
  ]);
  return {
    games: facetFromGroup(games, 'game'),
    formats: facetFromGroup(formats, 'format'),
    statuses: facetFromGroup(statuses, 'status'),
    countries: facetFromGroup(countries, 'country'),
    cities: facetFromGroup(cities, 'city').slice(0, 200),
    states: facetFromGroup(states, 'state'),
  };
}

export async function readCursor(key: string): Promise<number> {
  const row = await prisma.topdeckPollerState.findUnique({ where: { key } });
  const v = (row?.value ?? null) as { index?: number } | null;
  return typeof v?.index === 'number' ? v.index : 0;
}

export async function writeCursor(key: string, index: number): Promise<void> {
  await prisma.topdeckPollerState.upsert({
    where: { key },
    create: { key, value: { index }, heartbeatAt: new Date() },
    update: { value: { index }, heartbeatAt: new Date() },
  });
}
