export type TopdeckStatus = 'upcoming' | 'ongoing' | 'completed' | 'unknown';

export interface NormalizedStanding {
  name: string;
  id: string | null;
  standing: number | null;
  points: number | null;
  winRate: number | null;
  opponentWinRate: number | null;
  decklist: string | null;
}

export interface NormalizedTopdeckTournament {
  tid: string;
  name: string;
  game: string;
  format: string;
  startDate: Date | null;
  endDate: Date | null;
  status: TopdeckStatus;
  rawStatus: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  participants: number;
  topCut: number | null;
  swissNum: number | null;
  averageElo: number | null;
  standings: NormalizedStanding[] | null;
  headerImage: string | null;
  hasDetail: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ONGOING_WINDOW_MS = 2 * DAY_MS;

function asString(v: unknown): string | null {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function unixToDate(value: unknown): Date | null {
  const n = asNumber(value);
  if (n === null || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function mapRawStatus(raw: unknown): TopdeckStatus | null {
  const s = asString(raw);
  if (!s) return null;
  const l = s.toLowerCase();
  if (/(complete|finished|ended|done|final)/.test(l)) return 'completed';
  if (/(ongoing|in progress|in-progress|started|active|running|live)/.test(l)) return 'ongoing';
  if (/(upcoming|scheduled|registration|not started|not-started|pending|open)/.test(l)) return 'upcoming';
  return null;
}

export function deriveStatus(
  startDate: Date | null,
  endDate: Date | null,
  now: number = Date.now(),
): TopdeckStatus {
  if (startDate) {
    const start = startDate.getTime();
    if (start > now) return 'upcoming';
    if (endDate && endDate.getTime() < now) return 'completed';
    if (now - start <= ONGOING_WINDOW_MS) return 'ongoing';
    return 'completed';
  }
  if (endDate) return endDate.getTime() < now ? 'completed' : 'ongoing';
  return 'unknown';
}

function normalizeStandings(raw: unknown): NormalizedStanding[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map((entry) => {
    const e = (entry ?? {}) as Record<string, unknown>;
    return {
      name: asString(e.name) ?? 'Unknown',
      id: asString(e.id),
      standing: asNumber(e.standing),
      points: asNumber(e.points),
      winRate: asNumber(e.winRate),
      opponentWinRate: asNumber(e.opponentWinRate),
      decklist: asString(e.decklist),
    };
  });
}

function pick(...vals: unknown[]): unknown {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

export function normalizeSearchItem(
  raw: unknown,
  now: number = Date.now(),
): NormalizedTopdeckTournament | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const tid = asString(pick(r.TID, r.tid, r.id, r._id));
  if (!tid) return null;

  const eventData = (r.eventData && typeof r.eventData === 'object' ? r.eventData : {}) as Record<string, unknown>;
  const standings = normalizeStandings(r.standings);

  const startDate = unixToDate(r.startDate);
  const status = deriveStatus(startDate, null, now);

  return {
    tid,
    name: asString(pick(r.tournamentName, r.name)) ?? tid,
    game: asString(r.game) ?? '',
    format: asString(r.format) ?? '',
    startDate,
    endDate: null,
    status,
    rawStatus: null,
    city: asString(pick(eventData.city, r.city)),
    state: asString(pick(eventData.state, r.state)),
    country: asString(pick(eventData.country, r.country)),
    locationName: asString(pick(eventData.address, eventData.location, r.address)),
    lat: asNumber(pick(eventData.lat, r.lat)),
    lng: asNumber(pick(eventData.lng, r.lng)),
    participants: standings ? standings.length : (asNumber(pick(r.players, r.playerCount, r.participants)) ?? 0),
    topCut: asNumber(r.topCut),
    swissNum: asNumber(r.swissNum),
    averageElo: asNumber(r.averageElo),
    standings,
    headerImage: asString(pick(eventData.headerImage, r.headerImage)),
    hasDetail: false,
  };
}

export interface NormalizedDetail {
  status: TopdeckStatus;
  rawStatus: string | null;
  endDate: Date | null;
  startDate: Date | null;
  city: string | null;
  state: string | null;
  country: string | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  headerImage: string | null;
}

export function normalizeDetailInfo(
  raw: unknown,
  now: number = Date.now(),
): NormalizedDetail | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const loc = (r.location && typeof r.location === 'object' ? r.location : {}) as Record<string, unknown>;
  const startDate = unixToDate(r.startDate);
  const endDate = unixToDate(r.endDate);
  const mapped = mapRawStatus(r.status);
  const status = mapped ?? deriveStatus(startDate, endDate, now);
  return {
    status,
    rawStatus: asString(r.status),
    endDate,
    startDate,
    city: asString(pick(loc.city, r.city)),
    state: asString(pick(loc.state, r.state)),
    country: asString(pick(loc.country, r.country)),
    locationName: asString(pick(loc.name, loc.address, r.address)),
    lat: asNumber(pick(loc.lat, r.lat)),
    lng: asNumber(pick(loc.lng, r.lng)),
    headerImage: asString(pick(r.headerImage, loc.headerImage)),
  };
}

export function mergeDetail(
  base: NormalizedTopdeckTournament,
  detail: NormalizedDetail,
): NormalizedTopdeckTournament {
  return {
    ...base,
    status: detail.status,
    rawStatus: detail.rawStatus ?? base.rawStatus,
    endDate: detail.endDate ?? base.endDate,
    startDate: detail.startDate ?? base.startDate,
    city: detail.city ?? base.city,
    state: detail.state ?? base.state,
    country: detail.country ?? base.country,
    locationName: detail.locationName ?? base.locationName,
    lat: detail.lat ?? base.lat,
    lng: detail.lng ?? base.lng,
    headerImage: detail.headerImage ?? base.headerImage,
    hasDetail: true,
  };
}
