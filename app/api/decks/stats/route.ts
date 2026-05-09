import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { gunzipSync } from 'zlib';

interface DailyEntry { d: number; w: number; l: number; x: number; e: number }

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

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const [decks, statsRows] = await Promise.all([
      prisma.deck.findMany({
        where: { userId },
        select: { id: true, name: true },
        orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
        take: 50,
      }),
      prisma.deckStats.findMany({
        where: { userId },
        take: 50,
      }),
    ]);

    const statsByDeck = new Map(statsRows.map((s) => [s.deckId, s]));

    const result = decks.map((d) => {
      const s = statsByDeck.get(d.id);
      if (!s) {
        return {
          deckId: d.id,
          deckName: d.name,
          wins: 0,
          losses: 0,
          draws: 0,
          eloDeltaSum: 0,
          gamesTotal: 0,
          winrate: 0,
          lastPlayedAt: null,
          daily: [],
        };
      }
      const gamesTotal = s.wins + s.losses + s.draws;
      return {
        deckId: d.id,
        deckName: d.name,
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
        eloDeltaSum: s.eloDeltaSum,
        gamesTotal,
        winrate: gamesTotal > 0 ? Math.round((s.wins / gamesTotal) * 100) : 0,
        lastPlayedAt: s.lastPlayedAt.toISOString(),
        daily: decompressDaily(s.dailyGz as Buffer | null | undefined),
      };
    });

    return NextResponse.json({ decks: result });
  } catch (err) {
    console.error('[deckStats batch] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
