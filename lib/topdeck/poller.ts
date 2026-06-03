import { topdeckClient, type TopdeckClient } from './client';
import { topdeckGameFormatPairs, nextRoundRobinIndex, type GameFormatPair } from './games';
import { normalizeSearchItem, normalizeDetailInfo, type NormalizedTopdeckTournament } from './normalize';
import {
  upsertListTournaments,
  applyDetail,
  readCursor,
  writeCursor,
  getTournamentByTid,
  reconcileStaleStatuses,
} from './cache';
import { acquireOrRenewLeaderLock } from './leaderLock';
import { createSingleFlight } from './singleFlight';
import { swrState } from './swr';
import { pollEventHub } from './eventHub';
import {
  TOPDECK_SEARCH_LOOKBACK_DAYS,
  TOPDECK_UPCOMING_LOOKAHEAD_DAYS,
  TOPDECK_SEARCH_COLUMNS,
  TOPDECK_MAX_ITEMS_PER_PAIR,
  TOPDECK_PAIRS_PER_TICK,
  TOPDECK_DETAIL_FRESH_MS,
  TOPDECK_DETAIL_STALE_MS,
} from './constants';

const CURSOR_KEY = 'round-robin';
const DAY_S = 24 * 60 * 60;

export interface PollDeps {
  client?: TopdeckClient;
  pairs?: GameFormatPair[];
  now?: () => number;
  pairsPerTick?: number;
  maxItemsPerPair?: number;
}

export interface PairResult {
  game: string;
  format: string;
  fetched: number;
  upserted: number;
  error?: string;
}

export interface PollResult {
  skipped: boolean;
  reason?: string;
  cursorStart?: number;
  cursorEnd?: number;
  pairs: PairResult[];
  eventHub?: { fetched: number; upserted: number; error?: string };
  reconciled?: { toOngoing: number; toCompleted: number; error?: string };
}

export async function searchPair(
  client: TopdeckClient,
  game: string,
  format: string,
  now: number,
  maxItems: number,
): Promise<NormalizedTopdeckTournament[]> {
  const start = Math.floor(now / 1000) - TOPDECK_SEARCH_LOOKBACK_DAYS * DAY_S;
  const end = Math.floor(now / 1000) + TOPDECK_UPCOMING_LOOKAHEAD_DAYS * DAY_S;
  const data = await client.post('/v2/tournaments', {
    game,
    format,
    start,
    end,
    columns: TOPDECK_SEARCH_COLUMNS,
  });
  if (!Array.isArray(data)) return [];
  const normalized: NormalizedTopdeckTournament[] = [];
  for (const item of data) {
    const n = normalizeSearchItem(item, now);
    if (n && n.tid !== 'temp-event' && n.tid !== 'test-tournament-setup') normalized.push(n);
  }
  // Never let the per-pair cap drop upcoming events: keep ALL future ones
  // (soonest first), then fill the rest with the most recent past.
  const future = normalized
    .filter((t) => (t.startDate?.getTime() ?? 0) > now)
    .sort((a, b) => (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0));
  const past = normalized
    .filter((t) => (t.startDate?.getTime() ?? 0) <= now)
    .sort((a, b) => (b.startDate?.getTime() ?? 0) - (a.startDate?.getTime() ?? 0));
  return [...future, ...past.slice(0, Math.max(0, maxItems - future.length))];
}

export async function pollOnce(deps: PollDeps = {}): Promise<PollResult> {
  const client = deps.client ?? topdeckClient();
  const pairs = deps.pairs ?? topdeckGameFormatPairs();
  const now = deps.now ?? Date.now;
  const pairsPerTick = deps.pairsPerTick ?? TOPDECK_PAIRS_PER_TICK;
  const maxItems = deps.maxItemsPerPair ?? TOPDECK_MAX_ITEMS_PER_PAIR;

  if (!pairs.length) return { skipped: true, reason: 'no-pairs', pairs: [] };

  let cursor = await readCursor(CURSOR_KEY);
  if (cursor >= pairs.length) cursor = 0;
  const cursorStart = cursor;
  const results: PairResult[] = [];

  for (let i = 0; i < Math.min(pairsPerTick, pairs.length); i++) {
    const pair = pairs[cursor];
    try {
      const items = await searchPair(client, pair.game, pair.format, now(), maxItems);
      const upserted = await upsertListTournaments(items);
      results.push({ game: pair.game, format: pair.format, fetched: items.length, upserted });
    } catch (e) {
      results.push({
        game: pair.game,
        format: pair.format,
        fetched: 0,
        upserted: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    cursor = nextRoundRobinIndex(cursor, pairs.length);
  }

  await writeCursor(CURSOR_KEY, cursor);
  return { skipped: false, cursorStart, cursorEnd: cursor, pairs: results };
}

export async function runPollerTick(instanceId: string, deps: PollDeps = {}): Promise<PollResult> {
  const leader = await acquireOrRenewLeaderLock(instanceId);
  if (!leader) return { skipped: true, reason: 'not-leader', pairs: [] };
  const result = await pollOnce(deps);
  try {
    const eh = await pollEventHub({ now: deps.now });
    result.eventHub = eh;
  } catch (e) {
    result.eventHub = { fetched: 0, upserted: 0, error: e instanceof Error ? e.message : String(e) };
  }
  try {
    const now = deps.now ? deps.now() : Date.now();
    result.reconciled = await reconcileStaleStatuses(now);
  } catch (e) {
    result.reconciled = { toOngoing: 0, toCompleted: 0, error: e instanceof Error ? e.message : String(e) };
  }
  return result;
}

const detailFlight = createSingleFlight();

export interface DetailDeps {
  client?: TopdeckClient;
  now?: () => number;
  force?: boolean;
}

export async function ensureTournamentDetail(tid: string, deps: DetailDeps = {}) {
  const now = deps.now ?? Date.now;
  const existing = await getTournamentByTid(tid);
  if (!existing) return null;

  if (!deps.force && existing.status === 'upcoming') return existing;

  if (!deps.force) {
    const state = swrState({
      fetchedAt: existing.detailFetchedAt?.getTime() ?? null,
      now: now(),
      freshMs: TOPDECK_DETAIL_FRESH_MS,
      staleMs: TOPDECK_DETAIL_STALE_MS,
    });
    if (existing.hasDetail && state === 'fresh') return existing;
  }

  return detailFlight.run(`detail:${tid}`, async () => {
    const client = deps.client ?? topdeckClient();
    try {
      const info = await client.get(`/v2/tournaments/${encodeURIComponent(tid)}/info`);
      const detail = normalizeDetailInfo(info, now());
      let rounds: unknown;
      try {
        rounds = await client.get(`/v2/tournaments/${encodeURIComponent(tid)}/rounds`);
      } catch {
        rounds = undefined;
      }
      if (detail) await applyDetail(tid, detail, rounds);
      return getTournamentByTid(tid);
    } catch {
      return existing;
    }
  });
}
