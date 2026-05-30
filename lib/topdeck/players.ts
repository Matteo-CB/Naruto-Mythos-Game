import { prisma } from '@/lib/db/prisma';

export interface PlayerResultInput {
  tid: string;
  name: string;
  game: string;
  format: string;
  startDate: Date | null;
  standings: unknown;
}

export interface PlayerResultRow {
  playerKey: string;
  playerName: string;
  playerId: string | null;
  tid: string;
  tournamentName: string;
  game: string;
  format: string;
  startDate: Date | null;
  standing: number | null;
  points: number | null;
  winRate: number | null;
}

export interface PlayerSummary {
  playerKey: string;
  playerName: string;
  playerId: string | null;
  tournamentsPlayed: number;
}

export interface PlayerStats extends PlayerSummary {
  bestFinish: number | null;
  wins: number;
  top8s: number;
  avgWinRate: number | null;
  games: string[];
}

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

export function extractPlayerResults(t: PlayerResultInput): PlayerResultRow[] {
  if (!Array.isArray(t.standings)) return [];
  const out: PlayerResultRow[] = [];
  const seen = new Set<string>();
  for (const entry of t.standings) {
    const e = (entry ?? {}) as Record<string, unknown>;
    const name = strOrNull(e.name);
    const id = strOrNull(e.id);
    const key = id ?? name;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      playerKey: key,
      playerName: name ?? key,
      playerId: id,
      tid: t.tid,
      tournamentName: t.name,
      game: t.game,
      format: t.format,
      startDate: t.startDate,
      standing: numOrNull(e.standing),
      points: numOrNull(e.points),
      winRate: numOrNull(e.winRate),
    });
  }
  return out;
}

export function groupPlayersForSearch(rows: PlayerResultRow[]): PlayerSummary[] {
  const map = new Map<string, { playerName: string; playerId: string | null; count: number; latest: number }>();
  for (const r of rows) {
    const cur = map.get(r.playerKey);
    const ts = r.startDate?.getTime() ?? 0;
    if (!cur) {
      map.set(r.playerKey, { playerName: r.playerName, playerId: r.playerId, count: 1, latest: ts });
    } else {
      cur.count += 1;
      if (ts >= cur.latest) {
        cur.latest = ts;
        cur.playerName = r.playerName;
      }
    }
  }
  return Array.from(map.entries())
    .map(([playerKey, v]) => ({ playerKey, playerName: v.playerName, playerId: v.playerId, tournamentsPlayed: v.count }))
    .sort((a, b) => b.tournamentsPlayed - a.tournamentsPlayed || a.playerName.localeCompare(b.playerName));
}

export function aggregatePlayerStats(rows: PlayerResultRow[]): PlayerStats | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => (b.startDate?.getTime() ?? 0) - (a.startDate?.getTime() ?? 0));
  const standings = rows.map((r) => r.standing).filter((n): n is number => n != null);
  const winRates = rows.map((r) => r.winRate).filter((n): n is number => n != null);
  const games = Array.from(new Set(rows.map((r) => r.game).filter((g) => !!g)));
  return {
    playerKey: rows[0].playerKey,
    playerId: rows[0].playerId,
    playerName: sorted[0].playerName,
    tournamentsPlayed: rows.length,
    bestFinish: standings.length ? Math.min(...standings) : null,
    wins: rows.filter((r) => r.standing === 1).length,
    top8s: rows.filter((r) => r.standing != null && r.standing <= 8).length,
    avgWinRate: winRates.length ? winRates.reduce((a, b) => a + b, 0) / winRates.length : null,
    games,
  };
}

type TournamentRowLike = {
  tid: string;
  name: string;
  game: string;
  format: string;
  startDate: Date | null;
  standings: unknown;
};

export async function syncPlayerResults(row: TournamentRowLike): Promise<number> {
  const results = extractPlayerResults(row);
  await prisma.topdeckPlayerResult.deleteMany({ where: { tid: row.tid } });
  if (results.length) {
    await prisma.topdeckPlayerResult.createMany({ data: results });
  }
  return results.length;
}

export async function searchPlayers(q: string, limit = 30): Promise<PlayerSummary[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const rows = await prisma.topdeckPlayerResult.findMany({
    where: { playerName: { contains: term, mode: 'insensitive' } },
    take: 600,
  });
  return groupPlayersForSearch(rows as unknown as PlayerResultRow[]).slice(0, limit);
}

export interface PlayerStatsResult extends PlayerStats {
  results: {
    tid: string;
    tournamentName: string;
    game: string;
    format: string;
    startDate: string | null;
    standing: number | null;
    points: number | null;
    winRate: number | null;
  }[];
}

export async function getPlayerStats(playerKey: string): Promise<PlayerStatsResult | null> {
  const rows = await prisma.topdeckPlayerResult.findMany({
    where: { playerKey },
    orderBy: { startDate: 'desc' },
    take: 500,
  });
  if (!rows.length) return null;
  const stats = aggregatePlayerStats(rows as unknown as PlayerResultRow[]);
  if (!stats) return null;
  return {
    ...stats,
    results: rows.map((r) => ({
      tid: r.tid,
      tournamentName: r.tournamentName,
      game: r.game,
      format: r.format,
      startDate: r.startDate ? r.startDate.toISOString() : null,
      standing: r.standing,
      points: r.points,
      winRate: r.winRate,
    })),
  };
}

export async function backfillAllPlayerResults(): Promise<{ tournaments: number; results: number }> {
  const rows = await prisma.topdeckTournament.findMany({
    where: { NOT: { standings: { equals: null } } },
    select: { tid: true, name: true, game: true, format: true, startDate: true, standings: true },
  });
  let total = 0;
  for (const r of rows) total += await syncPlayerResults(r);
  return { tournaments: rows.length, results: total };
}
