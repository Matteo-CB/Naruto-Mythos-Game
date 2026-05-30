export const TOPDECK_BASE_URL = 'https://topdeck.gg/api';

export const TOPDECK_RATE_CAP_PER_MIN = 8;
export const TOPDECK_RATE_WINDOW_MS = 60_000;

export const TOPDECK_MAX_RETRIES = 4;
export const TOPDECK_BASE_BACKOFF_MS = 2_000;
export const TOPDECK_MAX_BACKOFF_MS = 30_000;

export const TOPDECK_LIST_FRESH_MS = 90_000;
export const TOPDECK_LIST_STALE_MS = 15 * 60_000;
export const TOPDECK_DETAIL_FRESH_MS = 60_000;
export const TOPDECK_DETAIL_STALE_MS = 30 * 60_000;

export const TOPDECK_SEARCH_LOOKBACK_DAYS = 365;
export const TOPDECK_UPCOMING_LOOKAHEAD_DAYS = 730;
export const TOPDECK_MAX_ITEMS_PER_PAIR = 500;
export const TOPDECK_PAIRS_PER_TICK = 2;
export const TOPDECK_SEARCH_COLUMNS = ['name', 'id', 'startDate', 'game', 'format', 'location', 'lat', 'lng', 'city', 'state', 'country', 'address', 'headerImage'];

export const TOPDECK_ATTRIBUTION_URL = 'https://topdeck.gg';
export const TOPDECK_ATTRIBUTION_TEXT_FR = 'Données fournies par TopDeck.gg';
export const TOPDECK_ATTRIBUTION_TEXT_EN = 'Data provided by TopDeck.gg';

export function topdeckTournamentUrl(tid: string): string {
  return `https://topdeck.gg/tournament/${encodeURIComponent(tid)}`;
}

export function topdeckEventUrl(id: string): string {
  return `https://topdeck.gg/event/${encodeURIComponent(id)}`;
}

export function topdeckBracketUrl(id: string): string {
  return `https://topdeck.gg/bracket/${encodeURIComponent(id)}`;
}
