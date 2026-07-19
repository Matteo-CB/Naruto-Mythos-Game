import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { seasonBoundsForDate } from '@/lib/worldcup/season';

export const dynamic = 'force-dynamic';

interface CompactRow {
  code: string;
  score: number;
  rank: number | null;
}

export async function GET() {
  try {
    const bounds = seasonBoundsForDate(new Date());
    const snapshots = await prisma.worldcupSnapshot.findMany({
      where: { seasonKey: bounds.seasonKey },
      orderBy: { day: 'asc' },
      select: { day: true, standings: true },
    });

    const days = snapshots.map((s) => s.day);
    const latest = snapshots.length > 0 ? (snapshots[snapshots.length - 1].standings as unknown as CompactRow[]) : [];
    const topCodes = latest
      .filter((r) => r.rank !== null)
      .slice(0, 5)
      .map((r) => r.code);

    const series = topCodes.map((code) => ({
      code,
      points: snapshots.map((s) => {
        const row = (s.standings as unknown as CompactRow[]).find((r) => r.code === code);
        return row ? row.score : null;
      }),
    }));

    return NextResponse.json(
      { seasonKey: bounds.seasonKey, days, series },
      { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' } },
    );
  } catch {
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
