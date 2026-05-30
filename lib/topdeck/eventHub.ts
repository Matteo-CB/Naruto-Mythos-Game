import { deriveStatus, unixToDate, type NormalizedTopdeckTournament } from './normalize';
import { upsertListTournaments } from './cache';

const HUB_PAGE = 'https://topdeck.gg/naruto';
export const EVENT_HUB_GAME = 'Naruto';
const CONFIG_TTL_MS = 60 * 60 * 1000;
const TS_PER_PAGE = 250;
const TS_MAX_PAGES = 12;

export interface TypesenseConfig {
  host: string;
  key: string;
  collection: string;
}

interface EventDoc {
  id?: string;
  eventName?: string;
  game?: string;
  format?: string;
  startDate?: number;
  endDate?: number;
  city?: string;
  state?: string;
  country?: string;
  location?: string;
  coordinates?: number[];
  playersRegd?: number;
  eventPlayerCap?: number;
  eventHeaderImage?: string;
  publish?: boolean;
}

let cachedConfig: { cfg: TypesenseConfig; at: number } | null = null;

export function parseTypesenseConfig(html: string): TypesenseConfig | null {
  const hostMatch = html.match(/https?:\/\/[a-z0-9-]+\.[a-z0-9.-]*typesense\.net/i);
  let host = hostMatch ? hostMatch[0] : null;
  if (!host) {
    const m = html.match(/([a-z0-9-]+\.a[0-9]\.typesense\.net)/i);
    if (m) host = `https://${m[1]}`;
  }
  let key: string | null = null;
  const patterns = [
    /TS_SEARCH_KEY\s*[=:]\s*["'`]([^"'`]+)/,
    /TS_KEY\s*[=:]\s*["'`]([^"'`]+)/,
    /searchKey\s*[=:]\s*["'`]([^"'`]+)/i,
    /X-TYPESENSE-API-KEY["'`]\s*[:,]\s*["'`]([^"'`]+)/i,
    /typesense[^"'`]{0,40}["'`]([A-Za-z0-9]{8,})["'`]/i,
    /apiKey\s*[=:]\s*["'`]([A-Za-z0-9]{8,})["'`]/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) { key = m[1]; break; }
  }
  const coll = (html.match(/collections\/([a-z0-9_-]+)\/documents/i) || [])[1]
    || (html.match(/TS_COLLECTION\s*[=:]\s*["'`]([^"'`]+)/) || [])[1]
    || 'events';
  if (!host || !key) return null;
  return { host, key, collection: coll };
}

export async function getTypesenseConfig(fetchImpl: typeof fetch = fetch): Promise<TypesenseConfig | null> {
  if (cachedConfig && Date.now() - cachedConfig.at < CONFIG_TTL_MS) return cachedConfig.cfg;
  try {
    const res = await fetchImpl(HUB_PAGE);
    if (!res.ok) return cachedConfig?.cfg ?? null;
    const html = await res.text();
    const cfg = parseTypesenseConfig(html);
    if (cfg) {
      cachedConfig = { cfg, at: Date.now() };
      return cfg;
    }
  } catch {
    return cachedConfig?.cfg ?? null;
  }
  return cachedConfig?.cfg ?? null;
}

export function normalizeEventDoc(doc: EventDoc, now: number = Date.now()): NormalizedTopdeckTournament | null {
  const id = typeof doc.id === 'string' && doc.id.trim() ? doc.id.trim() : null;
  if (!id) return null;
  const startDate = unixToDate(doc.startDate);
  const endDate = unixToDate(doc.endDate);
  const coords = Array.isArray(doc.coordinates) ? doc.coordinates : [];
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    tid: id,
    name: str(doc.eventName) ?? id,
    game: str(doc.game) ?? EVENT_HUB_GAME,
    format: str(doc.format) ?? '',
    startDate,
    endDate,
    status: deriveStatus(startDate, endDate, now),
    rawStatus: null,
    city: str(doc.city),
    state: str(doc.state),
    country: str(doc.country),
    locationName: str(doc.location),
    lat: typeof coords[0] === 'number' ? coords[0] : null,
    lng: typeof coords[1] === 'number' ? coords[1] : null,
    participants: num(doc.playersRegd) ?? 0,
    topCut: null,
    swissNum: null,
    averageElo: null,
    standings: null,
    headerImage: str(doc.eventHeaderImage),
    hasDetail: false,
  };
}

async function tsSearchPage(
  cfg: TypesenseConfig,
  filterBy: string,
  page: number,
  fetchImpl: typeof fetch,
): Promise<{ found: number; docs: EventDoc[] }> {
  const qs = new URLSearchParams({
    q: '*',
    query_by: 'eventName',
    filter_by: filterBy,
    sort_by: 'startDate:asc',
    per_page: String(TS_PER_PAGE),
    page: String(page),
  });
  const res = await fetchImpl(`${cfg.host}/collections/${cfg.collection}/documents/search?${qs.toString()}`, {
    headers: { 'X-TYPESENSE-API-KEY': cfg.key },
  });
  if (!res.ok) return { found: 0, docs: [] };
  const data = (await res.json()) as { found?: number; hits?: { document?: EventDoc }[] };
  const docs = Array.isArray(data.hits) ? data.hits.map((h) => h.document ?? {}) : [];
  return { found: typeof data.found === 'number' ? data.found : docs.length, docs };
}

export interface EventHubDeps {
  now?: () => number;
  fetchImpl?: typeof fetch;
  game?: string;
}

export async function fetchUpcomingEvents(deps: EventHubDeps = {}): Promise<NormalizedTopdeckTournament[]> {
  const now = (deps.now ?? Date.now)();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const game = deps.game ?? EVENT_HUB_GAME;
  const cfg = await getTypesenseConfig(fetchImpl);
  if (!cfg) return [];
  const filterBy = `publish:true && game:\`${game}\` && startDate:>=${Math.floor(now / 1000)}`;
  const out: NormalizedTopdeckTournament[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= TS_MAX_PAGES; page++) {
    const { found, docs } = await tsSearchPage(cfg, filterBy, page, fetchImpl);
    if (!docs.length) break;
    for (const doc of docs) {
      const n = normalizeEventDoc(doc, now);
      if (n && !seen.has(n.tid)) { seen.add(n.tid); out.push(n); }
    }
    if (out.length >= found) break;
  }
  return out;
}

export async function pollEventHub(deps: EventHubDeps = {}): Promise<{ fetched: number; upserted: number }> {
  const events = await fetchUpcomingEvents(deps);
  if (!events.length) return { fetched: 0, upserted: 0 };
  const upserted = await upsertListTournaments(events);
  return { fetched: events.length, upserted };
}
