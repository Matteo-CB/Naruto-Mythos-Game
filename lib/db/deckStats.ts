import { gzipSync, gunzipSync } from 'zlib';
import { prisma } from './prisma';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 90;

export type DeckResult = 'win' | 'loss' | 'draw';

interface DailyEntry {
  d: number;
  w: number;
  l: number;
  x: number;
  e: number;
}

function daysSinceEpoch(ts: number = Date.now()): number {
  return Math.floor(ts / DAY_MS);
}

function compressDaily(daily: DailyEntry[]): Uint8Array<ArrayBuffer> {
  if (daily.length === 0) {
    const empty = gzipSync('[]', { level: 9 });
    const out = new Uint8Array(new ArrayBuffer(empty.byteLength));
    out.set(empty);
    return out;
  }
  const json = JSON.stringify(daily);
  const gz = gzipSync(json, { level: 9 });
  const out = new Uint8Array(new ArrayBuffer(gz.byteLength));
  out.set(gz);
  return out;
}

function decompressDaily(buf: Buffer | Uint8Array | null | undefined): DailyEntry[] {
  if (!buf) return [];
  try {
    const source = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    const json = gunzipSync(source).toString('utf8');
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter((e): e is DailyEntry =>
      e && typeof e.d === 'number' && typeof e.w === 'number'
        && typeof e.l === 'number' && typeof e.x === 'number'
        && typeof e.e === 'number',
    );
  } catch {
    return [];
  }
}

export async function recordDeckGame(
  deckId: string,
  userId: string,
  result: DeckResult,
  eloDelta: number,
): Promise<void> {
  if (!deckId) return;
  try {
    const today = daysSinceEpoch();
    const cutoff = today - WINDOW_DAYS;

    const existing = await prisma.deckStats.findUnique({ where: { deckId } });
    let daily = decompressDaily(existing?.dailyGz as Buffer | null | undefined);
    daily = daily.filter((d) => d.d >= cutoff);

    let todayEntry = daily.find((d) => d.d === today);
    if (!todayEntry) {
      todayEntry = { d: today, w: 0, l: 0, x: 0, e: 0 };
      daily.push(todayEntry);
    }
    if (result === 'win') todayEntry.w += 1;
    else if (result === 'loss') todayEntry.l += 1;
    else todayEntry.x += 1;
    const safeDelta = Number.isFinite(eloDelta) ? Math.round(eloDelta) : 0;
    todayEntry.e += safeDelta;

    daily.sort((a, b) => a.d - b.d);

    let wins = 0, losses = 0, draws = 0, eloDeltaSum = 0;
    for (const d of daily) {
      wins += d.w;
      losses += d.l;
      draws += d.x;
      eloDeltaSum += d.e;
    }

    const dailyGz = compressDaily(daily);
    const now = new Date();

    if (existing) {
      await prisma.deckStats.update({
        where: { deckId },
        data: { wins, losses, draws, eloDeltaSum, lastPlayedAt: now, dailyGz },
      });
    } else {
      await prisma.deckStats.create({
        data: { deckId, userId, wins, losses, draws, eloDeltaSum, lastPlayedAt: now, dailyGz },
      });
    }
  } catch (err) {
    console.warn('[DeckStats] recordDeckGame failed:', err instanceof Error ? err.message : err);
  }
}

export interface DeckStatsSummary {
  deckId: string;
  wins: number;
  losses: number;
  draws: number;
  eloDeltaSum: number;
  lastPlayedAt: Date;
  daily: DailyEntry[];
}

export async function getDeckStats(deckId: string): Promise<DeckStatsSummary | null> {
  const row = await prisma.deckStats.findUnique({ where: { deckId } });
  if (!row) return null;
  return {
    deckId: row.deckId,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    eloDeltaSum: row.eloDeltaSum,
    lastPlayedAt: row.lastPlayedAt,
    daily: decompressDaily(row.dailyGz as Buffer | null | undefined),
  };
}

export async function deleteDeckStats(deckId: string): Promise<void> {
  try {
    await prisma.deckStats.deleteMany({ where: { deckId } });
  } catch {
    // best-effort
  }
}
